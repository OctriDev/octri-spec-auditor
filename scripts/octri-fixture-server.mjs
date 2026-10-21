/** Browser qualification fixture only. Never import this server into a product. */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

export const projectId = "111111111111111111111111";
const user = {
  id: "222222222222222222222222",
  email: "qualification@example.invalid",
  name: "Qualification fixture",
  onboardingCompletedAt: "2026-10-16T00:00:00Z",
  mfaEnabled: true,
};
const org = {
  id: "333333333333333333333333",
  name: "Qualification fixture",
  plan: "growth",
  billingStatus: "active",
  orgType: "standard",
};
const capabilities = Object.fromEntries(
  [
    "apiStudio",
    "sdkStudio",
    "docsEditor",
    "playground",
    "monitoring",
    "settings",
  ].map((name) => [name, "edit"]),
);
const permissions = {
  projectAccess: { mode: "all", projectIds: [] },
  capabilities,
  canCreateProjects: true,
  canDeleteProjects: true,
  canPublish: true,
  canManageMembers: true,
  canManageBilling: true,
};
const project = {
  id: projectId,
  name: "Pets qualification fixture",
  slug: "pets-fixture",
  docsSubdomain: "pets-fixture",
  status: "active",
  theme: { primaryColor: "#3cbb8f", fontFamily: "system" },
  createdAt: "2026-10-16T00:00:00Z",
};
let source = readFileSync("fixtures/pets.yaml", "utf8").replace(
  "      operationId: listPets\n",
  "",
);
let specId = "444444444444444444444444";
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname.replace(
    /^\/api\/v1/,
    "",
  );
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const send = (status, body) =>
    response.writeHead(status).end(JSON.stringify(body));
  if (path === "/auth/me")
    return send(200, {
      user,
      org,
      role: "owner",
      permissions,
      memberships: [
        { orgId: org.id, orgName: org.name, role: "owner", status: "active" },
      ],
    });
  if (path === `/projects/${projectId}/sdk/audit/source`)
    return send(200, { specId, content: source, ignored: [] });
  if (
    path === `/projects/${projectId}/specs/raw` &&
    request.method === "POST"
  ) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.expectedCurrentSpecId !== specId)
      return send(409, {
        error: {
          code: "SPEC_SOURCE_CHANGED",
          message: "Fixture source changed",
        },
      });
    source = body.content;
    specId = "555555555555555555555555";
    return send(201, { spec: { id: specId, isCurrent: true }, jobs: [] });
  }
  if (path === "/projects") return send(200, { projects: [project], total: 1 });
  if (path === `/projects/${projectId}`) return send(200, project);
  if (path === "/public/spec-audit/reports")
    return send(200, { reports: [], total: 0 });
  if (path === "/organisations/current" || path === "/org")
    return send(200, org);
  return send(200, {});
});
server.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log("Browser fixture API ready; synthetic data only"),
);
