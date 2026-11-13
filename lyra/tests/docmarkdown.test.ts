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

describe("chat markdown", () => {
  it("draws a list that sits right under its lead-in line, and one that follows a numbered list", async () => {
    const { Markdown } = await import("../web/src/markdown.tsx");
    const html = renderToStaticMarkup(createElement(Markdown, { text: "I'd combine them with:\n- Upcoming events\n- Forms and deadlines\n1. First\n2. Second\nThat's it." }));
    expect(html).toBe('<p>I&#x27;d combine them with:</p><ul><li>Upcoming events</li><li>Forms and deadlines</li></ul><ol start="1" style="counter-reset:n 0"><li>First</li><li>Second</li></ol><p>That&#x27;s it.</p>');
  });
});
