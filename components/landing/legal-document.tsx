import Link from "next/link";
import type { Block, Inline } from "@/lib/content/legal";

const linkClass =
  "font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "strong") {
          return (
            <strong key={index} className="font-medium text-fg">
              {item.value}
            </strong>
          );
        }
        if (item.type === "link") {
          if (item.href.startsWith("/")) {
            return (
              <Link key={index} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            );
          }
          const external = item.href.startsWith("https:");
          return (
            <a
              key={index}
              href={item.href}
              className={linkClass}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {item.label}
            </a>
          );
        }
        return <span key={index}>{item.value}</span>;
      })}
    </>
  );
}

export function LegalBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-10 space-y-4 text-sm leading-relaxed text-fg-body sm:text-base">
      {blocks.map((block, index) => {
        if (block.type === "h2") {
          return (
            <h2 key={block.id} id={block.id} className="scroll-mt-24 pt-6 text-xl">
              {block.text}
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={block.id} id={block.id} className="scroll-mt-24 pt-2 text-base">
              {block.text}
            </h3>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inlines items={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    {block.headers.map((cell, cellIndex) => (
                      <th key={cellIndex} scope="col" className="px-4 py-3 font-medium">
                        <Inlines items={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border last:border-b-0">
                      {row.map((cell, cellIndex) =>
                        cellIndex === 0 ? (
                          <th
                            key={cellIndex}
                            scope="row"
                            className="w-[46%] px-4 py-3 align-top font-medium text-fg md:w-2/5"
                          >
                            <Inlines items={cell} />
                          </th>
                        ) : (
                          <td key={cellIndex} className="px-4 py-3 align-top text-fg-body">
                            <Inlines items={cell} />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={index}>
            <Inlines items={block.inlines} />
          </p>
        );
      })}
    </div>
  );
}
