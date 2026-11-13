import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocMarkdown } from "../web/src/markdown.tsx";

describe("docs render more of Markdown", () => {
  it("headings, checklists, tables, dividers, and never raw HTML", () => {
    const text = "# Trip\n## Friday\n- [ ] Pack\n- [x] Book hotel\n\n| Day | Plan |\n| --- | --- |\n| Sat | Hike |\n\n---\n1. One\n2. Two\n<script>alert(1)</script>";
    const html = renderToStaticMarkup(createElement(DocMarkdown, { text }));
    expect(html).toContain("<h2>Trip</h2><h3>Friday</h3>");
    expect(html).toContain('<ul class="checklist"><li class="todo">');
    expect(html).toContain('<li class="done">');
    expect(html).toContain("<th>Day</th>");
    expect(html).toContain("<td>Hike</td>");
    expect(html).toContain("<hr/>");
    expect(html).toContain('<ol start="1"');
    expect(html).not.toContain("<script>");
  });
});
