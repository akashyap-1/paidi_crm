import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

// Reads ANTHROPIC_API_KEY from the function's secrets.
const client = new Anthropic();
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";

export interface ThreadHeaders {
  subject: string;
  messages: { from: string; to: string; cc: string; date: string; snippet: string }[];
}

const Classification = z.object({
  paidi_probability: z.number(),
  reason: z.string(),
});

const CLASSIFY_SYSTEM = `You sort email for PAIDI (Philadelphia AI Development Initiative), a three-person team (Advik Kashyap, Neel Srinivasan, Raphy) that builds AI automation tools for small companies and finds clients through cold email, cold calls and referrals.

The inbox is a founder's personal Gmail, so most mail is personal and must be left alone. You see only headers and a short snippet of each message.

Decide how likely it is that the thread is PAIDI business: outreach to a prospect, a prospect's or client's reply, a referral or introduction, scheduling a sales call, a proposal or pilot, or anything else about PAIDI's clients and prospects. School, family, friends, receipts, newsletters, job applications and other personal mail are not PAIDI business.

Return paidi_probability between 0 and 1, and a reason of one short sentence that names the evidence without quoting personal content. Use the middle of the range when the headers are genuinely ambiguous; a human reviews those.`;

/** Classifies from headers and snippets only. Message bodies are never sent here. */
export async function classifyThread(thread: ThreadHeaders): Promise<{ probability: number; reason: string }> {
  const lines = thread.messages.map((m, i) =>
    `Message ${i + 1}\nFrom: ${m.from}\nTo: ${m.to}${m.cc ? `\nCc: ${m.cc}` : ""}\nDate: ${m.date}\nSnippet: ${m.snippet}`
  );
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Classification) },
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: `Subject: ${thread.subject}\n\n${lines.join("\n\n")}` }],
  });
  // A refusal or unparseable answer goes to the human review queue rather than being guessed.
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return { probability: 0.5, reason: "The classifier could not decide; needs a human look." };
  }
  const p = Math.min(1, Math.max(0, response.parsed_output.paidi_probability));
  return { probability: p, reason: response.parsed_output.reason };
}

const Summaries = z.object({
  summaries: z.array(z.object({ id: z.string(), summary: z.string() })),
});

const SUMMARY_SYSTEM = `You write CRM timeline entries for PAIDI, a small team selling AI automation tools to small companies. For each email, write one or two plain sentences saying what was said and any ask, objection or next step. Past tense, no greeting, no quoting at length. Return one summary per message id.`;

/** Summarises messages of a thread already classified as PAIDI business. */
export async function summarizeMessages(
  subject: string,
  messages: { id: string; direction: "sent" | "received"; from: string; body: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (messages.length === 0) return out;
  const parts = messages.map((m) =>
    `<message id="${m.id}" direction="${m.direction}" from="${m.from}">\n${m.body}\n</message>`
  );
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Summaries) },
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: `Subject: ${subject}\n\n${parts.join("\n\n")}` }],
    });
    for (const s of response.parsed_output?.summaries ?? []) out.set(s.id, s.summary);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`Claude summary failed (${e.status}): ${e.message}`);
    } else {
      throw e;
    }
  }
  return out;
}
