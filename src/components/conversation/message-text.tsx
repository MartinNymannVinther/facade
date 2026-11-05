import { Fragment, type ReactNode } from "react";
import { splitMentions } from "@/modules/conversation/view";

const INLINE = /(https?:\/\/[^\s<>)]+)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1])
      out.push(
        <a
          key={match.index}
          href={match[1]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary-hover break-all underline underline-offset-2"
        >
          {match[1]}
        </a>,
      );
    else if (match[2]) out.push(<strong key={match.index}>{match[2]}</strong>);
    else
      out.push(
        <code key={match.index} className="bg-muted rounded px-1 text-[0.88em]">
          {match[3]}
        </code>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A message's words: text in fixed elements, never HTML. */
export function MessageText({ body }: { body: string }) {
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {splitMentions(body).map((part, i) =>
        "text" in part ? (
          <Fragment key={i}>{inline(part.text)}</Fragment>
        ) : (
          <span key={i} className="facade-mention">
            @{part.name}
          </span>
        ),
      )}
    </p>
  );
}
