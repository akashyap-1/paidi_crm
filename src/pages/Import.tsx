import { Download, Upload } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/Shell";
import { cx, ErrorNote, Field, Loading, Tabs } from "../components/ui";
import { INTERACTION_LABEL, SOURCE_LABEL, STAGE_LABEL } from "../lib/constants";
import { useCrm, useWrite } from "../lib/data";
import { dateTime, domainOf } from "../lib/format";
import type { CallIntel, Company, CompanySource, Contact, Interaction, InteractionType, Stage } from "../lib/types";

type Kind = "companies" | "contacts" | "logs";
type Crm = ReturnType<typeof useCrm>;
type CsvRow = Record<string, string>;

const KINDS: { value: Kind; label: string }[] = [
  { value: "companies", label: "Companies" },
  { value: "contacts", label: "Contacts" },
  { value: "logs", label: "Call and touch logs" },
];
const NOUN: Record<Kind, [string, string]> = {
  companies: ["company", "companies"], contacts: ["contact", "contacts"], logs: ["touch", "touches"],
};
const count = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Shown in the preview even when no column is mapped, because a default applies. */
  show?: boolean;
  aliases: string[];
}

const COMPANY_ALIASES = ["company", "company name", "organization", "organisation", "firm", "account", "business"];
const INTEL_KEYS = ["why_took_call", "pain_points", "objections", "lost_interest_at", "asks", "next_step"] as const;

const FIELDS: Record<Kind, FieldDef[]> = {
  companies: [
    { key: "name", label: "Company name", required: true, aliases: [...COMPANY_ALIASES, "name"] },
    { key: "website", label: "Website", aliases: ["url", "site", "web", "domain", "homepage"] },
    { key: "industry", label: "Industry", aliases: ["sector", "vertical"] },
    { key: "employee_count", label: "Employees", aliases: ["employees", "headcount", "size", "people", "staff", "employee count", "company size", "team size"] },
    { key: "location", label: "Location", aliases: ["city", "hq", "headquarters", "address", "region"] },
    { key: "source", label: "Source", aliases: ["lead source", "found via", "channel"] },
    { key: "source_detail", label: "Source detail", aliases: ["source details", "source notes"] },
    { key: "stage", label: "Stage", show: true, aliases: ["status", "pipeline stage"] },
    { key: "lost_reason", label: "Lost reason", aliases: ["reason lost", "why lost", "reason"] },
    { key: "fit_score", label: "Fit score, 1 to 5", aliases: ["fit", "fit score", "score", "rating"] },
    { key: "notes", label: "Notes", aliases: ["note", "comments", "description"] },
  ],
  contacts: [
    { key: "name", label: "Contact name", required: true, aliases: ["contact", "full name", "name", "person"] },
    { key: "company", label: "Company", required: true, aliases: COMPANY_ALIASES },
    { key: "title", label: "Title", aliases: ["job title", "role", "position"] },
    { key: "email", label: "Email", aliases: ["e-mail", "email address", "mail"] },
    { key: "phone", label: "Phone", aliases: ["phone number", "telephone", "tel", "mobile", "cell"] },
    { key: "linkedin_url", label: "LinkedIn URL", aliases: ["linkedin", "linkedin profile", "profile url"] },
    { key: "referral_source", label: "Referral source", aliases: ["referral", "referred by", "introduced by"] },
  ],
  logs: [
    { key: "company", label: "Company", required: true, aliases: COMPANY_ALIASES },
    { key: "contact", label: "Contact", aliases: ["contact name", "person", "spoke with", "spoke to"] },
    { key: "type", label: "Type", show: true, aliases: ["kind", "channel", "touch type", "touch", "activity"] },
    { key: "date", label: "Date", required: true, aliases: ["when", "occurred at", "date time", "datetime", "timestamp", "time"] },
    { key: "who", label: "Who", show: true, aliases: ["by", "team member", "logged by", "owner", "rep", "caller"] },
    { key: "summary", label: "Summary", aliases: ["notes", "note", "description", "details"] },
    { key: "outcome", label: "Outcome", aliases: ["result", "disposition"] },
    { key: "why_took_call", label: "Why they took the call", aliases: ["why took call", "why call"] },
    { key: "pain_points", label: "Pain points", aliases: ["pain", "pains", "problems"] },
    { key: "objections", label: "Objections", aliases: ["objection", "pushback"] },
    { key: "lost_interest_at", label: "Where they lost interest", aliases: ["lost interest", "lost interest at"] },
    { key: "asks", label: "What they asked for", aliases: ["ask", "requests", "asked for"] },
    { key: "next_step", label: "Next step", aliases: ["next steps", "follow up", "next action"] },
  ],
};

const SAMPLES: Record<Kind, Record<string, string>[]> = {
  companies: [
    { "Company name": "Example Accounting LLP", Website: "https://example-accounting.com", Industry: "Accounting", Employees: "42", Location: "Philadelphia, PA", Source: "Referral", "Source detail": "Intro from a mentor", Stage: "Contacted", "Lost reason": "", "Fit score": "5", Notes: "Month-end close is manual" },
    { "Company name": "Sample Legal Group", Website: "samplelegal.example", Industry: "Legal", Employees: "25", Location: "Camden, NJ", Source: "LinkedIn post", "Source detail": "", Stage: "Lost", "Lost reason": "Chose another tool", "Fit score": "3", Notes: "" },
  ],
  contacts: [
    { "Contact name": "Jordan Example", Company: "Example Accounting LLP", Title: "Managing Partner", Email: "jordan@example-accounting.com", Phone: "215-555-0100", "LinkedIn URL": "https://www.linkedin.com/in/jordan-example", "Referral source": "" },
    { "Contact name": "Sam Sample", Company: "Sample Legal Group", Title: "Operations Manager", Email: "sam@samplelegal.example", Phone: "", "LinkedIn URL": "", "Referral source": "Introduced by Jordan Example" },
  ],
  logs: [
    { Company: "Example Accounting LLP", Contact: "Jordan Example", Type: "Call", Date: "2026-10-02 14:30", Who: "Advik", Summary: "Walked through how they close the month", Outcome: "Wants a proposal", "Why they took the call": "Referred by a client", "Pain points": "Re-keying invoices", Objections: "Worried about data security", "Where they lost interest": "", "What they asked for": "A one-page summary", "Next step": "Send proposal by Friday" },
    { Company: "Sample Legal Group", Contact: "", Type: "Voicemail", Date: "2026-10-05", Who: "Neel", Summary: "Left a message with the main line", Outcome: "", "Why they took the call": "", "Pain points": "", Objections: "", "Where they lost interest": "", "What they asked for": "", "Next step": "" },
  ],
};

// --- Matching free text to the CRM's own values --------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(fields: FieldDef[], headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const names = (f: FieldDef) => [f.key, f.label, ...f.aliases].map(norm);
  for (const f of fields) {
    const h = headers.find((x) => !used.has(x) && names(f).includes(norm(x)));
    if (h) { out[f.key] = h; used.add(h); }
  }
  for (const f of fields) {
    if (out[f.key]) continue;
    const h = headers.find((x) => !used.has(x) && names(f).some((n) => n.length >= 5 && norm(x).includes(n)));
    if (h) { out[f.key] = h; used.add(h); }
  }
  return out;
}

function mapSource(text: string): CompanySource | null {
  const n = norm(text);
  if (!n) return null;
  for (const k of Object.keys(SOURCE_LABEL) as CompanySource[]) {
    if (n === norm(k) || n === norm(SOURCE_LABEL[k])) return k;
  }
  if (n.includes("linkedin")) return "linkedin_post";
  if (n.includes("accelerator") || n.includes("incubator")) return "accelerator";
  if (n.includes("news") || n.includes("press")) return "news";
  if (n.includes("referr") || n.includes("intro")) return "referral";
  if (n.includes("coldemail")) return "cold_email";
  return "other";
}

/** Null when the text is not a stage we know. */
function mapStage(text: string): Stage | null {
  const n = norm(text);
  for (const k of Object.keys(STAGE_LABEL) as Stage[]) {
    if (n === norm(k) || n === norm(STAGE_LABEL[k])) return k;
  }
  const loose: Record<string, Stage> = {
    followup: "followed_up", replied: "responded", reply: "responded", call: "call_held", proposal: "proposal_sent",
    customer: "client", won: "client", closedwon: "client", closedlost: "lost",
  };
  return loose[n] ?? null;
}

function mapType(text: string): InteractionType {
  const t = text.toLowerCase().replace(/[_-]+/g, " ");
  if (/voice ?mail|\bvm\b/.test(t)) return "voicemail";
  if (/gatekeeper|secretary|reception|assistant/.test(t)) return "gatekeeper";
  if (/meeting/.test(t)) return "meeting";
  if (/linkedin/.test(t)) return "linkedin";
  if (/e ?mail/.test(t)) return /\b(in|inbound|received|reply|replied)\b/.test(t) ? "email_in" : "email_out";
  return "call";
}

function parseDate(text: string): Date | null {
  // A bare calendar day is a local day, not midnight UTC.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
  return text && !Number.isNaN(d.getTime()) ? d : null;
}

// --- Turning mapped rows into a plan --------------------------------------------

interface Item {
  display: Record<string, string>;
  company?: Partial<Company>;
  /** Contacts and logs: the lowercased company name this row belongs to. */
  companyKey?: string;
  contact?: Partial<Contact>;
  touch?: Partial<Interaction>;
  intel?: Partial<CallIntel> | null;
}
interface Plan {
  items: Item[];
  skipped: Map<string, number>;
  notes: string[];
  /** Companies that do not exist yet and are created first: key to name as written. */
  newCompanies: Map<string, string>;
}

function buildPlan(kind: Kind, rows: CsvRow[], mapping: Record<string, string>, crm: Crm, meId: string | null): Plan {
  const plan: Plan = { items: [], skipped: new Map(), notes: [], newCompanies: new Map() };
  const skip = (reason: string) => { plan.skipped.set(reason, (plan.skipped.get(reason) ?? 0) + 1); };
  const get = (row: CsvRow, key: string) => (mapping[key] ? String(row[mapping[key]] ?? "").trim() : "");
  const byName = new Map(crm.companies.map((c) => [c.name.trim().toLowerCase(), c]));

  if (kind === "companies") {
    const domains = new Set(crm.companies.map((c) => c.domain?.toLowerCase()).filter(Boolean));
    const seen = new Set<string>();
    let badStage = 0, badFit = 0;
    for (const row of rows) {
      const name = get(row, "name");
      if (!name) { skip("No company name"); continue; }
      const website = get(row, "website");
      const domain = domainOf(website);
      const key = name.toLowerCase();
      if (byName.has(key) || (domain && domains.has(domain))) { skip("Already in the CRM (same name or website)"); continue; }
      if (seen.has(key) || (domain && seen.has(`@${domain}`))) { skip("Repeated in this file"); continue; }
      seen.add(key);
      if (domain) seen.add(`@${domain}`);

      const people = Number((get(row, "employee_count").match(/\d[\d,]*/)?.[0] ?? "").replace(/,/g, ""));
      const stageText = get(row, "stage");
      const stage = mapStage(stageText) ?? "researched";
      if (stageText && !mapStage(stageText)) badStage++;
      const fitText = get(row, "fit_score");
      const fit = Math.round(Number(fitText));
      const fitOk = !!fitText && fit >= 1 && fit <= 5;
      if (fitText && !fitOk) badFit++;
      const source = mapSource(get(row, "source"));
      const lostReason = stage === "lost" ? get(row, "lost_reason") || "Imported as lost" : null;
      plan.items.push({
        company: {
          name, website: website || null, domain, industry: get(row, "industry") || null,
          employee_count: people > 0 ? people : null, location: get(row, "location") || null,
          source, source_detail: get(row, "source_detail") || null, stage, lost_reason: lostReason,
          fit_score: fitOk ? fit : null, notes: get(row, "notes") || null,
        },
        display: {
          name, website, industry: get(row, "industry"), employee_count: people > 0 ? String(people) : "",
          location: get(row, "location"), source: source ? SOURCE_LABEL[source] : "", source_detail: get(row, "source_detail"),
          stage: STAGE_LABEL[stage], lost_reason: lostReason ?? "", fit_score: fitOk ? String(fit) : "", notes: get(row, "notes"),
        },
      });
    }
    if (badStage) plan.notes.push(`${count(badStage, ["row has", "rows have"])} a stage the CRM does not know and will come in as Researched.`);
    if (badFit) plan.notes.push(`${count(badFit, ["row has", "rows have"])} a fit score outside 1 to 5. The suggested score is used instead.`);
    return plan;
  }

  const company = (row: CsvRow): string | null => {
    const name = get(row, "company");
    if (!name) return null;
    const key = name.toLowerCase();
    if (!byName.has(key) && !plan.newCompanies.has(key)) plan.newCompanies.set(key, name);
    return key;
  };

  if (kind === "contacts") {
    const emails = new Set(crm.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
    const people = new Set(crm.contacts.map((c) => `${c.company_id}|${c.name.trim().toLowerCase()}`));
    const seen = new Set<string>();
    let badEmail = 0;
    for (const row of rows) {
      const name = get(row, "name");
      if (!name) { skip("No contact name"); continue; }
      if (!get(row, "company")) { skip("No company"); continue; }
      const typed = get(row, "email").toLowerCase();
      const email = /^\S+@\S+\.\S+$/.test(typed) ? typed : null;
      const companyName = get(row, "company").toLowerCase();
      const existing = byName.get(companyName);
      if (email ? emails.has(email) : !!existing && people.has(`${existing.id}|${name.toLowerCase()}`)) {
        skip(email ? "Email already in the CRM" : "Already in the CRM (same name at that company)"); continue;
      }
      const dupe = email ?? `${companyName}|${name.toLowerCase()}`;
      if (seen.has(dupe)) { skip("Repeated in this file"); continue; }
      seen.add(dupe);
      if (typed && !email) badEmail++;
      const companyKey = company(row)!;
      plan.items.push({
        companyKey,
        contact: {
          name, title: get(row, "title") || null, email, phone: get(row, "phone") || null,
          linkedin_url: get(row, "linkedin_url") || null, referral_source: get(row, "referral_source") || null,
        },
        display: {
          name, company: get(row, "company"), title: get(row, "title"), email: email ?? "", phone: get(row, "phone"),
          linkedin_url: get(row, "linkedin_url"), referral_source: get(row, "referral_source"),
        },
      });
    }
    if (badEmail) plan.notes.push(`${count(badEmail, ["row has", "rows have"])} an email that does not look like an address. The contact is imported without it.`);
    // Companies named only on skipped rows are not created.
    const needed = new Set(plan.items.map((i) => i.companyKey));
    for (const key of [...plan.newCompanies.keys()]) if (!needed.has(key)) plan.newCompanies.delete(key);
    return plan;
  }

  // Call and touch logs
  const logged = new Set(crm.interactions.map((i) => `${i.company_id}|${i.type}|${new Date(i.occurred_at).toISOString()}`));
  const seen = new Set<string>();
  let noContact = 0, noWho = 0;
  for (const row of rows) {
    const companyName = get(row, "company");
    if (!companyName) { skip("No company"); continue; }
    const date = parseDate(get(row, "date"));
    if (!date) { skip(get(row, "date") ? "Date could not be read" : "No date"); continue; }
    const type = mapType(get(row, "type"));
    const iso = date.toISOString();
    const existing = byName.get(companyName.toLowerCase());
    if (existing && logged.has(`${existing.id}|${type}|${iso}`)) { skip("Already logged (same company, type and time)"); continue; }
    const dupe = `${companyName.toLowerCase()}|${type}|${iso}`;
    if (seen.has(dupe)) { skip("Repeated in this file"); continue; }
    seen.add(dupe);

    const contactName = get(row, "contact");
    const contact = existing && contactName
      ? crm.contacts.find((c) => c.company_id === existing.id && c.name.trim().toLowerCase() === contactName.toLowerCase())
      : undefined;
    if (contactName && !contact) noContact++;
    const whoText = get(row, "who");
    const who = whoText ? crm.team.find((m) => m.display_name.toLowerCase() === whoText.toLowerCase()) : undefined;
    if (whoText && !who) noWho++;
    const whoId = who?.id ?? meId;
    const intel: Record<string, string | null> = {};
    for (const k of INTEL_KEYS) intel[k] = get(row, k) || null;
    const hasIntel = INTEL_KEYS.some((k) => intel[k]);
    const companyKey = company(row)!;
    plan.items.push({
      companyKey,
      touch: {
        contact_id: contact?.id ?? null, type, occurred_at: iso, team_member_id: whoId,
        summary: get(row, "summary") || null, outcome: get(row, "outcome") || null, source: "import",
      },
      intel: hasIntel ? intel : null,
      display: {
        company: companyName, contact: contact?.name ?? "", type: INTERACTION_LABEL[type], date: dateTime(iso),
        who: (whoId ? crm.member.get(whoId)?.display_name : null) ?? "You",
        summary: get(row, "summary"), outcome: get(row, "outcome"),
        ...Object.fromEntries(INTEL_KEYS.map((k) => [k, intel[k] ?? ""])),
      },
    });
  }
  if (noContact) plan.notes.push(`${count(noContact, ["row names", "rows name"])} a contact that is not in the CRM at that company. Those touches are logged against the company only; import contacts first to link them.`);
  if (noWho) plan.notes.push(`${count(noWho, ["row names", "rows name"])} someone who is not on the team. Those touches are logged as yours.`);
  const needed = new Set(plan.items.map((i) => i.companyKey));
  for (const key of [...plan.newCompanies.keys()]) if (!needed.has(key)) plan.newCompanies.delete(key);
  return plan;
}

function chunks<T>(list: T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// --- Page ------------------------------------------------------------------------

interface Parsed { file: string; headers: string[]; rows: CsvRow[] }
interface Result { kind: Kind; imported: number; companiesCreated: number; withIntel: number; skipped: number }

export function Import() {
  const crm = useCrm();
  const write = useWrite();
  const { member } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("companies");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const fields = FIELDS[kind];
  const missing = fields.filter((f) => f.required && !mapping[f.key]);
  const meId = member?.id ?? null;
  const plan = useMemo(
    () => (parsed && missing.length === 0 ? buildPlan(kind, parsed.rows, mapping, crm, meId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, mapping, kind, crm.companies, crm.contacts, crm.interactions, crm.team, meId],
  );

  const changeKind = (k: Kind) => {
    setKind(k);
    setMapping(parsed ? autoMap(FIELDS[k], parsed.headers) : {});
    setResult(null);
    setFailure(null);
  };

  const load = (file: File | undefined | null) => {
    if (!file) return;
    setResult(null);
    setFailure(null);
    setParsed(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setFileError(`${file.name} is not a CSV file. In your spreadsheet, choose File, Download, Comma-separated values (.csv) and use that file.`);
      return;
    }
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^﻿/, "").trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        // eslint-disable-next-line no-control-regex
        if (headers.some((h) => /[\u0000-\u0008]/.test(h))) {
          setFileError(`${file.name} could not be read as text. Save it again as a .csv file and try once more.`);
        } else if (headers.length === 0 || res.data.length === 0) {
          setFileError(`${file.name} has no rows to import. It needs a header line with column names, then one line per record.`);
        } else {
          setFileError(null);
          setParsed({ file: file.name, headers, rows: res.data });
          setMapping(autoMap(FIELDS[kind], headers));
        }
      },
      error: () => setFileError(`${file.name} could not be read. Check that it is not open in another program, then try again.`),
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    load(e.dataTransfer.files[0]);
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([Papa.unparse(SAMPLES[kind])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paidi-${kind}-sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!plan || plan.items.length === 0) return;
    setBusy(true);
    setFailure(null);
    let done = 0, created = 0, withIntel = 0;
    try {
      if (kind === "companies") {
        for (const part of chunks(plan.items)) {
          await write.insert("companies", part.map((i) => i.company!));
          done += part.length;
        }
      } else {
        const ids = new Map(crm.companies.map((c) => [c.name.trim().toLowerCase(), c.id]));
        for (const part of chunks([...plan.newCompanies.values()])) {
          const rows = await write.insert("companies", part.map((name) => ({ name, source_detail: "Created during CSV import" })));
          for (const r of rows) ids.set(r.name.trim().toLowerCase(), r.id);
          created += rows.length;
        }
        for (const part of chunks(plan.items)) {
          if (kind === "contacts") {
            await write.insert("contacts", part.map((i) => ({ ...i.contact, company_id: ids.get(i.companyKey!)! })));
          } else {
            const touches = part.map((i) => ({ ...i.touch, id: crypto.randomUUID(), company_id: ids.get(i.companyKey!)! }));
            await write.insert("interactions", touches);
            const intel = part.flatMap((i, n) => (i.intel ? [{ ...i.intel, interaction_id: touches[n].id }] : []));
            if (intel.length) await write.insert("call_intel", intel);
            withIntel += intel.length;
          }
          done += part.length;
        }
      }
      const skipped = [...plan.skipped.values()].reduce((a, b) => a + b, 0);
      setResult({ kind, imported: done, companiesCreated: created, withIntel, skipped });
      setParsed(null);
      setMapping({});
    } catch (e) {
      const message = e instanceof Error ? e.message : "The import stopped.";
      setFailure(`Stopped after importing ${done} of ${count(plan.items.length, ["row", "rows"])}: ${message} Fix the file and import it again; rows that are already in are skipped as duplicates.`);
    } finally {
      setBusy(false);
    }
  };

  if (crm.loading) return <Loading label="Loading the CRM" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  const columns = fields.filter((f) => mapping[f.key] || f.show);
  const skippedTotal = plan ? [...plan.skipped.values()].reduce((a, b) => a + b, 0) : 0;
  const sample = (f: FieldDef) => {
    const v = mapping[f.key] ? String(parsed?.rows[0]?.[mapping[f.key]] ?? "").trim() : "";
    return v ? `First row: ${v.length > 44 ? `${v.slice(0, 44)}…` : v}` : undefined;
  };

  return (
    <>
      <PageHeader title="Import">
        <div className="max-w-full overflow-x-auto">
          <Tabs label="What to import" value={kind} onChange={changeKind} options={KINDS} />
        </div>
      </PageHeader>

      <p className="mb-4 max-w-[78ch] text-[13px] text-mute">
        Bring in a spreadsheet saved as CSV: one line per {NOUN[kind][0]}, with column names on the first line.
        Past Gmail threads are not imported here. An admin reads them in from{" "}
        <Link to="/settings" className="link">Settings, Backfill past email</Link>.
      </p>

      {result && (
        <div className="mb-4 rounded-[12px] border border-green/40 bg-green-tint px-4 py-3" role="status">
          <p className="font-bold">
            {result.kind === "logs" ? `Logged ${count(result.imported, NOUN.logs)}` : `Imported ${count(result.imported, NOUN[result.kind])}`}
            {result.companiesCreated > 0 && ` and added ${count(result.companiesCreated, ["company that was", "companies that were"])} not in the CRM yet`}
            .
          </p>
          <p className="mt-0.5 text-[13px]">
            {result.withIntel > 0 && `${count(result.withIntel, ["touch has", "touches have"])} call notes. `}
            {result.skipped > 0 && `${count(result.skipped, ["row was", "rows were"])} skipped. `}
            <Link to={result.kind === "contacts" ? "/contacts" : "/pipeline"} className="link">
              {result.kind === "contacts" ? "See them in Contacts" : "See them in the pipeline"}
            </Link>
            {result.kind === "contacts" && <> or <Link to="/pipeline" className="link">open the pipeline</Link></>}
          </p>
        </div>
      )}

      <section aria-label="Choose a file">
        <h2 className="section-title mb-2">1. Choose a file</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx(
            "flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed px-4 py-7 text-center transition-colors duration-150",
            dragOver ? "border-depth-7 bg-depth-1" : "border-[#cbbf9b]",
          )}
        >
          <p className="max-w-[52ch] text-mute">
            {parsed
              ? <><strong className="break-all text-navy">{parsed.file}</strong>: {count(parsed.rows.length, ["row", "rows"])}, {count(parsed.headers.length, ["column", "columns"])}</>
              : `Drop a .csv file of ${NOUN[kind][1]} here, or choose one from this device.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className={cx("btn min-h-10", !parsed && "btn-navy")} onClick={() => input.current?.click()}>
              <Upload size={16} aria-hidden="true" /> {parsed ? "Choose another file" : "Choose a CSV file"}
            </button>
            <button className="btn min-h-10" onClick={downloadSample}>
              <Download size={16} aria-hidden="true" /> Download a sample for {KINDS.find((k) => k.value === kind)!.label.toLowerCase()}
            </button>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {fileError && <div className="mt-3"><ErrorNote error={fileError} /></div>}
      </section>

      {parsed && (
        <section className="mt-6" aria-label="Match columns">
          <h2 className="section-title">2. Match columns</h2>
          <p className="mb-2 mt-0.5 text-[13px] text-mute">
            Each CRM field on the left reads from one column of your file. Columns were matched by name; change any that are wrong.
          </p>
          <div className="card grid gap-x-5 gap-y-3.5 px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.required ? `${f.label} (required)` : f.label} hint={sample(f)}
                error={f.required && !mapping[f.key] ? "Choose the column that holds this." : null}>
                <select className="input" value={mapping[f.key] ?? ""} aria-invalid={f.required && !mapping[f.key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">Not in this file</option>
                  {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </section>
      )}

      {parsed && (
        <section className="mt-6" aria-label="Check and import">
          <h2 className="section-title">3. Check and import</h2>
          {!plan ? (
            <p className="mt-1 text-[13.5px] text-magenta-dark">
              Match {missing.map((f) => f.label).join(" and ")} above to see what will be imported.
            </p>
          ) : (
            <>
              <div className="mb-3 mt-1 text-[13.5px]">
                <p>
                  <strong>{count(plan.items.length, ["row", "rows"])} to import</strong>
                  {skippedTotal > 0 && `, ${skippedTotal} skipped`}
                  {plan.newCompanies.size > 0 && `. ${count(plan.newCompanies.size, ["company is", "companies are"])} not in the CRM yet and will be added first`}
                  .
                </p>
                {skippedTotal > 0 && (
                  <ul className="mt-1 text-[13px] text-mute">
                    {[...plan.skipped.entries()].map(([reason, n]) => <li key={reason}>{n} skipped: {reason}</li>)}
                  </ul>
                )}
                {plan.notes.map((n) => <p key={n} className="mt-1 max-w-[86ch] text-[13px] text-mute">{n}</p>)}
              </div>

              {plan.items.length > 0 && (
                <>
                  <div className="card overflow-x-auto">
                    <table className="table" style={{ minWidth: Math.max(560, columns.length * 150) }}>
                      <thead><tr>{columns.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                      <tbody>
                        {plan.items.slice(0, 8).map((item, i) => (
                          <tr key={i}>
                            {columns.map((f) => (
                              <td key={f.key} className="max-w-0">
                                <span className="block truncate" title={item.display[f.key]}>{item.display[f.key]}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {plan.items.length > 8 && <p className="hint">Showing the first 8 of {plan.items.length} rows, as they will be saved.</p>}
                </>
              )}

              {failure && <div className="mt-3"><ErrorNote error={failure} /></div>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className="btn btn-primary min-h-10" disabled={busy || plan.items.length === 0} onClick={runImport}>
                  {busy ? "Importing…" : `Import ${count(plan.items.length, ["row", "rows"])}`}
                </button>
                {plan.items.length === 0 && <span className="text-[13px] text-mute">Every row in this file was skipped, so there is nothing to import.</span>}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
