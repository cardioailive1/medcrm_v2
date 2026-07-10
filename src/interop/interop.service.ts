import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResourceDto } from './create-resource.dto';
import { SaveConnectionDto } from './save-connection.dto';

const KINDS = ['FHIR', 'HL7', 'PACS'];

// Small fetch helper with a hard timeout so a dead endpoint can't hang the request.
async function httpGet(url: string, headers: Record<string, string>, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, latency: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

@Injectable()
export class InteropService {
  constructor(private prisma: PrismaService) {}

  // ---- representational resource store (kept) ----
  list(organizationId: string, kind?: string) {
    const where: any = { organizationId };
    if (kind) {
      if (!KINDS.includes(kind)) throw new BadRequestException('Unknown kind');
      where.kind = kind;
    }
    return this.prisma.interopResource.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  create(organizationId: string, dto: CreateResourceDto) {
    if (!KINDS.includes(dto.kind)) throw new BadRequestException('Unknown kind');
    return this.prisma.interopResource.create({ data: { ...dto, organizationId } });
  }

  // ---- live connections ----
  async connections(organizationId: string) {
    const rows = await this.prisma.integrationConnection.findMany({ where: { organizationId } });
    const byKind: Record<string, any> = {};
    rows.forEach((r) => (byKind[r.kind] = { ...r, authToken: r.authToken ? '********' : null }));
    // Ensure all three kinds are represented for the UI.
    return KINDS.map((k) => byKind[k] || { kind: k, baseUrl: null, authType: 'NONE', enabled: false, status: 'UNKNOWN' });
  }

  async saveConnection(organizationId: string, dto: SaveConnectionDto) {
    if (!KINDS.includes(dto.kind)) throw new BadRequestException('Unknown kind');
    const data: any = {
      baseUrl: dto.baseUrl ?? null,
      authType: dto.authType ?? 'NONE',
      enabled: dto.enabled ?? true,
    };
    // Only overwrite the stored token when a new non-masked value is supplied.
    if (dto.authToken && dto.authToken !== '********') data.authToken = dto.authToken;
    const saved = await this.prisma.integrationConnection.upsert({
      where: { organizationId_kind: { organizationId, kind: dto.kind } },
      update: data,
      create: { organizationId, kind: dto.kind, ...data },
    });
    return { ...saved, authToken: saved.authToken ? '********' : null };
  }

  private authHeaders(conn: { authType: string; authToken: string | null }): Record<string, string> {
    if (conn.authType === 'BEARER' && conn.authToken) return { Authorization: `Bearer ${conn.authToken}` };
    if (conn.authType === 'BASIC' && conn.authToken) return { Authorization: `Basic ${conn.authToken}` };
    return {};
  }

  // REAL connectivity test against the configured endpoint.
  async testConnection(organizationId: string, kind: string) {
    if (!KINDS.includes(kind)) throw new BadRequestException('Unknown kind');
    const conn = await this.prisma.integrationConnection.findUnique({
      where: { organizationId_kind: { organizationId, kind } },
    });
    if (!conn || !conn.baseUrl) throw new BadRequestException('Configure a base URL for this connection first.');

    const base = conn.baseUrl.replace(/\/+$/, '');
    let result: { status: string; detail: string; latency?: number };
    try {
      if (kind === 'FHIR') {
        const r = await httpGet(`${base}/metadata`, { Accept: 'application/fhir+json', ...this.authHeaders(conn) });
        let ver = '';
        try { const j = JSON.parse(r.text); if (j.resourceType === 'CapabilityStatement') ver = j.fhirVersion || 'R4'; } catch {}
        result = r.ok && ver
          ? { status: 'ONLINE', detail: `FHIR ${ver} CapabilityStatement OK`, latency: r.latency }
          : { status: r.ok ? 'ERROR' : 'OFFLINE', detail: r.ok ? 'Endpoint responded but no CapabilityStatement' : `HTTP ${r.status}`, latency: r.latency };
      } else if (kind === 'PACS') {
        // DICOMweb QIDO-RS reachability check.
        const r = await httpGet(`${base}/studies?limit=1`, { Accept: 'application/dicom+json', ...this.authHeaders(conn) });
        result = r.ok
          ? { status: 'ONLINE', detail: 'DICOMweb QIDO-RS reachable', latency: r.latency }
          : { status: 'OFFLINE', detail: `HTTP ${r.status}`, latency: r.latency };
      } else {
        // HL7 v2 is MLLP/TCP; over HTTP we expose an inbound ingest endpoint instead.
        const r = await httpGet(base, this.authHeaders(conn));
        result = { status: r.ok ? 'ONLINE' : 'OFFLINE', detail: r.ok ? 'HL7 HTTP gateway reachable — post messages to /interop/hl7/ingest' : `HTTP ${r.status}`, latency: r.latency };
      }
    } catch (e: any) {
      result = { status: 'OFFLINE', detail: e?.name === 'AbortError' ? 'Timed out' : (e?.message || 'Connection failed') };
    }

    await this.prisma.integrationConnection.update({
      where: { organizationId_kind: { organizationId, kind } },
      data: { status: result.status, lastCheckedAt: new Date(), lastLatencyMs: result.latency ?? null, lastError: result.status === 'ONLINE' ? null : result.detail },
    });
    return { kind, ...result };
  }

  async status(organizationId: string) {
    const rows = await this.prisma.interopResource.groupBy({ by: ['kind'], where: { organizationId }, _count: true });
    const counts: Record<string, number> = { FHIR: 0, HL7: 0, PACS: 0 };
    rows.forEach((r) => (counts[r.kind] = r._count));
    return counts;
  }

  // REAL read-only pull of Patient resources from the configured FHIR server.
  async fhirImport(organizationId: string, take = 20) {
    const conn = await this.prisma.integrationConnection.findUnique({
      where: { organizationId_kind: { organizationId, kind: 'FHIR' } },
    });
    if (!conn || !conn.baseUrl) throw new BadRequestException('Configure the FHIR base URL first.');
    const base = conn.baseUrl.replace(/\/+$/, '');
    const r = await httpGet(`${base}/Patient?_count=${Math.min(take, 50)}`, { Accept: 'application/fhir+json', ...this.authHeaders(conn) });
    if (!r.ok) throw new BadRequestException(`FHIR server returned HTTP ${r.status}`);
    let bundle: any;
    try { bundle = JSON.parse(r.text); } catch { throw new BadRequestException('FHIR server did not return valid JSON'); }
    const entries: any[] = Array.isArray(bundle.entry) ? bundle.entry : [];
    const patients = entries.map((e) => {
      const p = e.resource || {};
      const name = Array.isArray(p.name) && p.name[0] ? [(p.name[0].given || []).join(' '), p.name[0].family].filter(Boolean).join(' ') : '(no name)';
      return { id: p.id, name, gender: p.gender || '', birthDate: p.birthDate || '' };
    });
    // Record what we pulled into the representational store for visibility.
    await this.prisma.interopResource.createMany({
      data: patients.slice(0, 25).map((p) => ({
        organizationId, kind: 'FHIR', resourceType: 'Patient', label: `${p.name} — id: ${p.id}`,
        meta: `Imported from ${base}`, status: 'Imported',
      })),
    }).catch(() => undefined);
    return { imported: patients.length, total: bundle.total ?? patients.length, patients };
  }
}
