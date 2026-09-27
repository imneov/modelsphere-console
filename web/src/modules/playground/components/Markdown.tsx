import { memo, useRef, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import "@/modules/playground/components/markdown.css";
import { CopyButton } from "@/modules/playground/components/CopyButton";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

function Pre(props: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="group relative">
      <pre ref={ref} {...props} />
      <CopyButton className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100" text={() => ref.current?.textContent ?? ""} />
    </div>
  );
}

const components = { pre: Pre };

// Memoized on the text: while one answer streams, finished messages above it do
// not re-parse on every frame.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="pg-markdown prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-pre:text-foreground">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
