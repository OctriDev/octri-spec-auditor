/** All authored content enters the DOM as text. No specification HTML executes. */
export function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") node.className = value;
    else node.setAttribute(name, String(value));
  }
  return node;
}

export function renderFindings(container, findings, selected, stale, actions) {
  container.replaceChildren();
  if (!findings.length) {
    container.append(
      element("p", "No findings match these filters.", { class: "muted" }),
    );
    return;
  }
  const groups = new Map();
  for (const finding of findings) {
    if (!groups.has(finding.ruleId)) groups.set(finding.ruleId, []);
    groups.get(finding.ruleId).push(finding);
  }
  for (const entries of groups.values()) {
    const group = element("details", undefined, { class: "finding-group" });
    group.open =
      groups.size <= 6 ||
      entries.some((finding) => finding.severity === "high");
    group.append(element("summary", `${entries[0].title} (${entries.length})`));
    let shown = 0;
    const more = element("button", "Show 20 more findings", {
      class: "secondary",
    });
    const append = () => {
      for (const finding of entries.slice(shown, shown + 20))
        group.insertBefore(findingRow(finding, selected, stale, actions), more);
      shown += 20;
      more.hidden = shown >= entries.length;
    };
    group.append(more);
    more.onclick = append;
    append();
    container.append(group);
  }
}

function findingRow(finding, selected, stale, actions) {
  const row = element("article", undefined, { class: "finding" });
  const heading = element("div", undefined, { class: "finding-heading" });
  if (finding.fix) {
    const checkbox = element("input", undefined, {
      type: "checkbox",
      "aria-label": `Select patch for ${finding.ruleId} at ${finding.target}`,
    });
    checkbox.checked = selected.has(finding.key);
    checkbox.disabled = stale;
    checkbox.onchange = () => actions.onSelect(finding.key, checkbox.checked);
    heading.append(checkbox);
  }
  const title = element("div");
  title.append(
    element("span", finding.severity, {
      class: `severity ${finding.severity}`,
    }),
    element("h3", finding.target),
  );
  heading.append(title);
  row.append(heading, element("p", finding.message));
  const source = element(
    "button",
    `${finding.location.uri}#${finding.location.pointer}${finding.location.line ? ` · ${finding.location.line}:${finding.location.column ?? 1}` : ""}`,
    { class: "source-link" },
  );
  source.onclick = () => actions.onLocate(finding.location);
  row.append(source);
  const detail = element("details", undefined, { class: "detail" });
  detail.append(element("summary", "Impact, evidence and remediation"));
  detail.append(
    element("p", `Impact: ${finding.impact}`),
    element("p", `Evidence: ${finding.evidence}. Rule: ${finding.ruleId}.`),
    element("p", `Action: ${finding.remediation}`),
  );
  if (finding.fix)
    detail.append(
      element(
        "p",
        `Patch: ${finding.fix.label}. ${finding.fix.kind === "review-required" ? "Review required: this can change generated public names." : "Deterministic change; review before applying."}`,
      ),
    );
  if (finding.fix && ["text", "response-schema"].includes(finding.fix.kind)) {
    const label = element(
      "label",
      finding.fix.kind === "text"
        ? "Write the actual description"
        : "Author the actual response schema as JSON",
    );
    const input = element("textarea", undefined, {
      rows: 4,
      spellcheck: "false",
      "aria-label": `${finding.fix.kind === "text" ? "Description" : "Response schema"} for ${finding.target}`,
    });
    const authored = actions.authored.get(finding.key);
    input.value = authored?.text ?? "";
    input.oninput = () =>
      actions.onAuthor(finding.key, input.value, finding.fix.kind);
    label.append(input);
    detail.append(label);
  }
  for (const related of finding.related) {
    const link = element(
      "button",
      `Related: ${related.uri}#${related.pointer}`,
      { class: "source-link" },
    );
    link.onclick = () => actions.onLocate(related);
    detail.append(link);
  }
  if (finding.ignorable) {
    const form = element("form", undefined, { class: "exclude-form" });
    const label = element("label", "Exclusion reason");
    const reason = element("input", undefined, {
      type: "text",
      required: "",
      maxlength: 500,
      placeholder: "Why is this acceptable here?",
    });
    label.append(reason);
    const expiryLabel = element("label", "Optional expiry");
    const expiry = element("input", undefined, { type: "date" });
    expiryLabel.append(expiry);
    const submit = element("button", "Exclude with reason", {
      type: "submit",
      class: "secondary",
    });
    submit.disabled = stale;
    form.append(label, expiryLabel, submit);
    form.onsubmit = (event) => {
      event.preventDefault();
      if (reason.value.trim())
        actions.onExclude(finding, reason.value.trim(), expiry.value);
    };
    detail.append(form);
  }
  row.append(detail);
  return row;
}

export function renderRules(container, results) {
  container.replaceChildren();
  for (const rule of results) {
    const row = element("tr");
    for (const value of [
      rule.ruleId,
      rule.status,
      rule.weight,
      `${rule.findings} / ${rule.denominator}`,
      rule.deduction,
    ])
      row.append(element("td", String(value)));
    if (rule.reason) row.title = rule.reason;
    container.append(row);
  }
}
