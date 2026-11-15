import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, useQuick } from "../components/Shell";
import { Avatar, cx, EmptyState, ErrorNote, Loading, StageChip } from "../components/ui";
import { ALL_STAGES } from "../lib/constants";
import { useCrm } from "../lib/data";
import { relativeDay } from "../lib/format";
import type { Company, Contact } from "../lib/types";

type SortKey = "name" | "title" | "company" | "stage" | "owner" | "last";
type Dnc = "all" | "hide" | "only";

interface Row {
  contact: Contact;
  company: Company | null;
  ownerId: string | null;
  ownerName: string;
  last: string | null;
  dnc: boolean;
}

export function Contacts() {
  const crm = useCrm();
  const quick = useQuick();
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [technical, setTechnical] = useState(false);
  const [dnc, setDnc] = useState<Dnc>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const rows: Row[] = useMemo(() => {
    const last = new Map<string, string>();
    for (const i of crm.interactions) {
      if (!i.contact_id) continue;
      const prev = last.get(i.contact_id);
      if (!prev || i.occurred_at > prev) last.set(i.contact_id, i.occurred_at);
    }
    return crm.contacts.map((contact) => {
      const company = crm.company.get(contact.company_id) ?? null;
      const ownerId = contact.owner_id ?? company?.owner_id ?? null;
      return {
        contact, company, ownerId,
        ownerName: (ownerId && crm.member.get(ownerId)?.display_name) || "~",
        last: last.get(contact.id) ?? null,
        dnc: contact.do_not_contact,
      };
    });
  }, [crm.contacts, crm.interactions, crm.company, crm.member]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const value = (r: Row): string | number => {
      switch (sort.key) {
        case "name": return r.contact.name.toLowerCase();
        case "title": return (r.contact.title ?? "~").toLowerCase();
        case "company": return (r.company?.name ?? "~").toLowerCase();
        case "stage": return r.company ? ALL_STAGES.indexOf(r.company.stage) : 99;
        case "owner": return r.ownerName.toLowerCase();
        case "last": return r.last ? -new Date(r.last).getTime() : Infinity;
      }
    };
    return rows
      .filter((r) => {
        const c = r.contact;
        if (owner && r.ownerId !== owner) return false;
        if (technical && !c.is_technical) return false;
        if (dnc === "hide" && r.dnc) return false;
        if (dnc === "only" && !r.dnc) return false;
        if (q && !`${c.name} ${c.title ?? ""} ${r.company?.name ?? ""} ${c.email ?? ""} ${c.phone ?? ""} ${c.referral_source ?? ""}`
          .toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const x = value(a), y = value(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.contact.name.localeCompare(b.contact.name);
      });
  }, [rows, query, owner, technical, dnc, sort]);

  if (crm.loading) return <Loading label="Loading contacts" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  const filtering = !!(query.trim() || owner || technical || dnc !== "all");
  const clear = () => { setQuery(""); setOwner(""); setTechnical(false); setDnc("all"); };
  const selectClass = (on: boolean) =>
    cx("input !h-9 !w-auto cursor-pointer !pr-8 text-[13.5px] font-medium", on && "!border-depth-7 !bg-depth-1");

  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-navy"
        onClick={() => setSort({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader title="Contacts">
        <span className="text-[13px] text-mute">
          {filtering ? `${shown.length} of ${rows.length}` : rows.length} {rows.length === 1 ? "person" : "people"}
        </span>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title="No contacts yet"
          action={<button className="btn btn-primary" onClick={quick.addProspect}>Add a prospect</button>}>
          Contacts are added with a prospect, or from the company page. Each one keeps its own touches and notes.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Owner</span>
              <select className={selectClass(!!owner)} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Owner: all</option>
                {crm.team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Do not contact</span>
              <select className={selectClass(dnc !== "all")} value={dnc} onChange={(e) => setDnc(e.target.value as Dnc)}>
                <option value="all">Do not contact: all</option>
                <option value="hide">Hide do not contact</option>
                <option value="only">Only do not contact</option>
              </select>
            </label>
            <label className={cx(
              "flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13.5px] font-medium",
              technical ? "border-depth-7 bg-depth-1" : "border-line bg-[#fffdf6]",
            )}>
              <input type="checkbox" className="h-[15px] w-[15px] cursor-pointer accent-depth-8" checked={technical}
                onChange={(e) => setTechnical(e.target.checked)} />
              Technical only
            </label>
            {filtering && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear filters</button>}
            <label className="relative ml-auto w-full sm:w-[260px]">
              <span className="sr-only">Search contacts</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
              <input className="input !h-9 !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, email" />
            </label>
          </div>

          {shown.length === 0 ? (
            <EmptyState title="Nothing matches these filters" action={<button className="btn" onClick={clear}>Clear filters</button>}>
              Loosen a filter or clear them to see every contact.
            </EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[1120px]">
                <colgroup>
                  <col className="w-[17%]" /><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[10%]" />
                  <col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[4%]" /><col className="w-[5%]" />
                </colgroup>
                <thead>
                  <tr>
                    <Th k="name">Name</Th><Th k="title">Title</Th><Th k="company">Company</Th><Th k="stage">Stage</Th>
                    <th>Email</th><th>Phone</th><th>Introduced by</th><Th k="owner">Owner</Th><Th k="last">Last touch</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const c = r.contact;
                    const to = `/company/${c.company_id}?contact=${c.id}`;
                    return (
                      <tr key={c.id} className={cx(r.dnc && "bg-lane/60 text-mute")}>
                        <td className="max-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <Link to={to} className={cx("truncate font-bold hover:underline", r.dnc && "line-through decoration-mute/60")}>{c.name}</Link>
                            {r.dnc && <span className="chip chip-plain shrink-0 !h-[19px] !px-2 !text-[11px]">Do not contact</span>}
                          </span>
                        </td>
                        <td className="max-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{c.title ?? ""}</span>
                            {c.is_technical && <span className="chip chip-plain shrink-0 !h-[19px] !px-2 !text-[11px]">Technical</span>}
                          </span>
                        </td>
                        <td className="max-w-0">
                          {r.company
                            ? <Link to={to} className="block truncate hover:underline">{r.company.name}</Link>
                            : <span className="text-mute">Unknown</span>}
                        </td>
                        <td>{r.company && <StageChip stage={r.company.stage} />}</td>
                        <td className="max-w-0">
                          {c.email && (r.dnc
                            ? <span className="block truncate">{c.email}</span>
                            : <a href={`mailto:${c.email}`} className="link block truncate !font-medium">{c.email}</a>)}
                        </td>
                        <td className="max-w-0">
                          {c.phone && (r.dnc
                            ? <span className="block truncate">{c.phone}</span>
                            : <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="link block truncate !font-medium">{c.phone}</a>)}
                        </td>
                        <td className="max-w-0"><span className="block truncate">{c.referral_source ?? ""}</span></td>
                        <td><Avatar member={r.ownerId ? crm.member.get(r.ownerId) : null} /></td>
                        <td className="whitespace-nowrap">{relativeDay(r.last)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
