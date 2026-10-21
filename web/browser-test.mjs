import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { once } from "node:events";
import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const port = 4189;
const server = spawn(process.execPath, ["web/serve.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});
await once(server.stdout, "data");
mkdirSync("artifacts/browser", { recursive: true });
const source = readFileSync("fixtures/pets.yaml", "utf8");
const request = {
  input: {
    uri: "memory://audit/openapi.yaml",
    content: source,
    generated: false,
  },
};
const expected = JSON.parse(
  execFileSync("target/release/octri-spec-audit", ["execute"], {
    input: JSON.stringify({ abiVersion: 1, action: "audit", request }),
  }),
).Ok;
const evidence = [];
try {
  for (const [name, browserType] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await browserType.launch();
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const errors = [];
      const outbound = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== `http://127.0.0.1:${port}`)
          outbound.push(request.url());
      });
      await page.goto(`http://127.0.0.1:${port}`);
      const actual = await page.evaluate(
        async (request) =>
          (await import("/packages/browser/index.mjs")).Auditor.audit(request),
        request,
      );
      assert.deepEqual(
        actual,
        expected,
        `${name}: complete Rust/WASM report parity`,
      );
      const exactNumber = await page.evaluate(async () => {
        const { Auditor, object } = await import("/packages/browser/index.mjs");
        for (const [id, proposal] of [
          ["findPetsByTags", undefined],
          ["findPetsByStatus", undefined],
          ["loginUser", undefined],
          ["logoutUser", undefined],
          ["placeOrder", undefined],
          ["ProvisionGetToken", undefined],
          ["getFindPetsByTags", "findPetsByTags"],
        ]) {
          const document = {
            openapi: "3.1.2",
            info: { title: "Naming", version: "1" },
            paths: {
              "/pets": {
                get: {
                  operationId: id,
                  responses: { 200: { description: "OK" } },
                },
              },
            },
          };
          const report = await Auditor.audit({ input: object(document) });
          const findings = report.findings.filter(
            (f) => f.ruleId === "operation-id-naming",
          );
          if (
            proposal === undefined
              ? findings.length !== 0
              : findings[0]?.fix?.edits[0]?.after !== proposal
          ) {
            throw new Error(`Unexpected naming proposal for ${id}`);
          }
        }
        const { EngineJob } = await import("/web/job.mjs");
        const { stringifyJson } = await import("/packages/browser/client.mjs");
        const content =
          '{"openapi":"3.1.2","info":{"title":"Numbers","version":"1.0.0"},"paths":{"/numbers":{"get":{"operationId":"getNumbers","responses":{"200":{"description":"Exact integer","x-counter":18446744073709551615}}}}}}';
        const report = await new EngineJob().run({
          abiVersion: 1,
          action: "audit",
          request: { input: { uri: "memory://audit/numbers.json", content } },
        });
        return stringifyJson(report);
      });
      assert.ok(
        exactNumber.includes("18446744073709551615"),
        `${name}: worker transport rounded an integer`,
      );
      await page.getByRole("button", { name: "Load sample" }).click();
      await page
        .locator("#status")
        .filter({ hasText: "Illustrative Pets sample loaded" })
        .waitFor();
      await page
        .getByRole("button", { name: "Audit specification", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      const original = await page.locator("#source").inputValue();
      const checkbox = page.getByRole("checkbox", {
        name: /Select patch for operation-id-present/,
      });
      await checkbox.check();
      await page
        .getByRole("button", { name: "Preview selected patches" })
        .click();
      await page.locator("#patch-preview:not([hidden])").waitFor();
      await page
        .getByRole("button", { name: "Apply reviewed patches" })
        .click();
      assert.match(await page.locator("#source").inputValue(), /operationId/);
      await page
        .getByRole("button", { name: "Undo patch", exact: true })
        .click();
      assert.equal(await page.locator("#source").inputValue(), original);
      await page.getByRole("button", { name: /^Docs/ }).click();
      const finding = page
        .locator(".finding")
        .filter({ hasText: "No summary or description" })
        .first();
      await finding.locator(".source-link").first().click();
      assert.ok(
        await page
          .locator("#source")
          .evaluate(
            (textarea) => textarea.selectionEnd > textarea.selectionStart,
          ),
      );
      await finding
        .getByText("Impact, evidence and remediation", { exact: true })
        .click();
      await finding
        .getByRole("textbox", { name: /Description for GET/ })
        .fill("List every pet visible to this account");
      await finding.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Preview selected patches" })
        .click();
      await page.locator("#patch-preview:not([hidden])").waitFor();
      await page
        .getByRole("button", { name: "Apply reviewed patches" })
        .click();
      assert.match(
        await page.locator("#source").inputValue(),
        /List every pet visible/,
      );
      const downloadEvent = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "HTML report", exact: true })
        .click();
      const download = await downloadEvent;
      await download.saveAs(`artifacts/browser/${name}-report.html`);
      assert.match(
        readFileSync(`artifacts/browser/${name}-report.html`, "utf8"),
        /<!doctype html>/i,
      );
      await page.locator("#source").fill("{");
      await page.locator("#source").dispatchEvent("input");
      await page
        .getByRole("button", { name: "Audit specification", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      assert.equal(await page.locator("#score").textContent(), "Blocked");
      await page.getByRole("button", { name: "Load sample" }).click();
      await page
        .locator("#status")
        .filter({ hasText: "Illustrative Pets sample loaded" })
        .waitFor();
      await page
        .getByRole("button", { name: "Audit specification", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      const sample = await page.locator("#source").inputValue();
      const sampleReport = await page.evaluate(async (content) => {
        const { Auditor, text } = await import("/packages/browser/index.mjs");
        return Auditor.audit({ input: text(content) });
      }, sample);
      await page.getByText("Profiles and team policy", { exact: true }).click();
      const baseline = await page.evaluate(
        async (report) =>
          (await import("/packages/browser/index.mjs")).Auditor.export(
            report,
            "baseline",
          ),
        sampleReport,
      );
      await page.locator("#baseline").setInputFiles({
        name: "baseline.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(baseline)),
      });
      await page.locator("#fail-new").check();
      await page
        .getByRole("button", { name: "Audit specification", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      assert.equal(
        JSON.parse(await page.locator("#config").inputValue()).failOnNew,
        true,
      );
      await page.getByText("Profiles and team policy", { exact: true }).click();
      await page.locator("#search").fill("not-a-real-rule-or-operation");
      assert.equal(await page.locator(".finding").count(), 0);
      await page.locator("#search").fill("");
      const cancellation = await page.evaluate(async () => {
        const { EngineJob } = await import("/web/job.mjs");
        const job = new EngineJob();
        const pending = job.run({ abiVersion: 1, action: "rules" }).then(
          () => "unexpected success",
          (error) => error.message,
        );
        job.cancel();
        return pending;
      });
      assert.match(cancellation, /cancelled/);
      assert.equal(await page.locator("#source").inputValue(), sample);
      const comparable = await page.evaluate(async (content) => {
        const { Auditor, text } = await import("/packages/browser/index.mjs");
        return Auditor.audit({
          input: text(content),
          config: JSON.parse(document.getElementById("config").value),
        });
      }, sample);
      await page.locator("#compare").setInputFiles({
        name: "earlier.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(comparable)),
      });
      await page.locator("#comparison:not([hidden])").waitFor();
      assert.match(
        await page.locator("#comparison-result").textContent(),
        /0 new.*0 resolved/,
      );
      const violations = (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations;
      assert.deepEqual(
        violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target),
        })),
        [],
        `${name}: accessibility violations`,
      );
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `artifacts/browser/${name}-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${name}: mobile overflow`,
      );
      await page.screenshot({
        path: `artifacts/browser/${name}-mobile.png`,
        fullPage: true,
      });
      const folder = mkdtempSync(join(tmpdir(), "octri-auditor-folder-"));
      try {
        mkdirSync(join(folder, "schemas"));
        writeFileSync(
          join(folder, "openapi.json"),
          JSON.stringify({
            openapi: "3.1.0",
            info: { title: "Folder API", version: "1" },
            paths: {
              "/pets": {
                get: {
                  operationId: "listPets",
                  responses: {
                    200: {
                      description: "Pets",
                      content: {
                        "application/json": {
                          schema: { $ref: "./schemas/pet.json" },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        );
        writeFileSync(
          join(folder, "schemas/pet.json"),
          JSON.stringify({
            type: "object",
            properties: { id: { type: "integer" } },
          }),
        );
        await page.reload();
        await page.locator("#upload-folder").setInputFiles(folder);
        const rootUri = `memory://audit/${basename(folder)}/openapi.json`;
        await page
          .locator(`#root option[value="${rootUri}"]`)
          .waitFor({ state: "attached" });
        await page.locator("#root").selectOption(rootUri);
        await page.locator("#audit").click();
        await page.locator("#report:not([hidden])").waitFor();
        assert.equal(await page.locator("#active-file option").count(), 2);
        const folderReport = await page.evaluate(async () => {
          const { Auditor, text } = await import("/packages/browser/index.mjs");
          const root = document.getElementById("root").value;
          return Auditor.audit({
            input: text(document.getElementById("source").value, root),
            files: {
              [new URL("schemas/pet.json", root).href]:
                '{"type":"object","properties":{"id":{"type":"integer"}}}',
            },
          });
        });
        assert.equal(folderReport.valid, true, `${name}: folder refs valid`);
        assert.equal(
          folderReport.complete,
          true,
          `${name}: folder refs complete`,
        );
        assert.ok(
          folderReport.manifest.files.some((file) =>
            file.uri.endsWith("/schemas/pet.json"),
          ),
        );
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
      assert.deepEqual(
        outbound,
        [],
        `${name}: offline source processing sent external requests`,
      );
      await page.evaluate((request) => {
        // A new parent load arriving during a job must not relabel its source.
        window.postMessage(
          {
            type: "octri-auditor:load",
            sourceSpecId: "original-version",
            request,
          },
          location.origin,
        );
        window.postMessage(
          {
            type: "octri-auditor:load",
            sourceSpecId: "newer-version",
            request,
          },
          location.origin,
        );
      }, request);
      await page.waitForFunction(
        (source) =>
          document.getElementById("source").value === source &&
          !document.getElementById("audit").disabled &&
          document
            .getElementById("status")
            .textContent.includes("Audit complete"),
        source,
      );
      const handoffVersion = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              window.removeEventListener("message", receive);
              reject(new Error("Handoff did not finish"));
            }, 15_000);
            function receive(event) {
              if (
                event.source === window &&
                event.data?.type === "octri-auditor:handoff"
              ) {
                clearTimeout(timer);
                window.removeEventListener("message", receive);
                resolve(event.data.sourceSpecId);
              }
            }
            window.addEventListener("message", receive);
            document.getElementById("handoff").click();
          }),
      );
      assert.equal(
        handoffVersion,
        "original-version",
        `${name}: handoff source version`,
      );
      const modern = readFileSync("fixtures/openapi32.json", "utf8");
      await page.locator("#source").fill(modern);
      await page.locator("#audit").click();
      await page
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      assert.notEqual(await page.locator("#score").textContent(), "Blocked");
      assert.match(
        await page.locator("#report-summary").textContent(),
        /2 operations/,
      );
      const modernOriginal = await page.locator("#source").inputValue();
      await page
        .getByRole("checkbox", {
          name: /Select patch for operation-id-present/,
        })
        .check();
      await page.locator("#preview").click();
      await page.locator("#patch-preview:not([hidden])").waitFor();
      await page.locator("#apply-patch").click();
      assert.equal(
        JSON.parse(await page.locator("#source").inputValue()).openapi,
        "3.2.1",
      );
      await page
        .getByRole("button", { name: "Undo patch", exact: true })
        .click();
      assert.equal(await page.locator("#source").inputValue(), modernOriginal);
      await page
        .locator("#source")
        .fill(
          '{"swagger":"2.0","info":{"title":"Legacy","version":"1"},"paths":{}}',
        );
      await page.locator("#audit").click();
      await page
        .locator("#report-state")
        .filter({ hasText: "Use Spec Converter first" })
        .waitFor();
      assert.equal(await page.locator("#score").textContent(), "Blocked");
      assert.match(
        await page.locator("#status").textContent(),
        /Spec Converter/,
      );
      const urlPage = await context.newPage();
      const sourceEndpoint = "/api/spec-audit/source";
      const sourceEndpointUrl = `http://127.0.0.1:${port}${sourceEndpoint}`;
      let sourceRequests = 0;
      await urlPage.route(sourceEndpointUrl, async (route) => {
        sourceRequests++;
        assert.equal(route.request().method(), "POST");
        assert.deepEqual(route.request().postDataJSON(), {
          url: "https://api.supdesk.app/openapi.json",
        });
        assert.equal(route.request().headers().cookie, undefined);
        await route.fulfill({
          status: 200,
          body: modern,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "x-spec-source-url": "https://api.supdesk.app/raw/openapi.json",
          },
        });
      });
      await urlPage.goto(
        `http://127.0.0.1:${port}/web/index.html?sourceEndpoint=${sourceEndpoint}`,
      );
      await urlPage.getByText("Fetch a URL", { exact: true }).click();
      assert.match(
        await urlPage.locator("#network-note").textContent(),
        /server fetches.*without your cookies/,
      );
      await urlPage
        .locator("#url")
        .fill("https://api.supdesk.app/openapi.json");
      await urlPage.locator("#fetch-url").click();
      await urlPage
        .locator("#error")
        .filter({ hasText: "Enable explicit network" })
        .waitFor();
      assert.equal(sourceRequests, 0);
      await urlPage.locator("#allow-network").check();
      await urlPage.locator("#fetch-url").click();
      await urlPage
        .locator("#status")
        .filter({ hasText: "Public URL source fetched through Octri" })
        .waitFor();
      assert.equal(sourceRequests, 1);
      assert.equal(await urlPage.locator("#source").inputValue(), modern);
      assert.equal(
        await urlPage.locator("#root").inputValue(),
        "https://api.supdesk.app/raw/openapi.json",
      );
      assert.equal(await urlPage.locator("#error").isHidden(), true);
      await urlPage.locator("#audit").click();
      await urlPage
        .locator("#status")
        .filter({ hasText: "Audit complete" })
        .waitFor();
      await urlPage.unroute(sourceEndpointUrl);
      await urlPage.route(sourceEndpointUrl, (route) =>
        route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              message:
                "The spec host refused this request (403). Download the file and upload it instead.",
            },
          }),
        }),
      );
      await urlPage.locator("#fetch-url").click();
      await urlPage
        .locator("#error")
        .filter({ hasText: "host refused this request (403)" })
        .waitFor();
      assert.equal(await urlPage.locator("#source").inputValue(), modern);
      assert.doesNotMatch(
        await urlPage.locator("#error").textContent(),
        /CORS|sign-in/,
      );
      await urlPage.goto(`http://127.0.0.1:${port}/web/index.html`);
      await urlPage.getByText("Fetch a URL", { exact: true }).click();
      await urlPage.locator("#allow-network").check();
      await urlPage.route("**/blocked-spec", (route) =>
        route.fulfill({ status: 403, body: "blocked" }),
      );
      await urlPage
        .locator("#url")
        .fill(`http://127.0.0.1:${port}/blocked-spec`);
      await urlPage.locator("#fetch-url").click();
      await urlPage
        .locator("#error")
        .filter({ hasText: "host refused this request (403)" })
        .waitFor();
      assert.doesNotMatch(
        await urlPage.locator("#error").textContent(),
        /CORS/,
      );
      await urlPage.route("**/unreachable-spec", (route) =>
        route.abort("failed"),
      );
      await urlPage
        .locator("#url")
        .fill(`http://127.0.0.1:${port}/unreachable-spec`);
      await urlPage.locator("#fetch-url").click();
      await urlPage
        .locator("#error")
        .filter({
          hasText: "the host may not allow CORS, or the network is unavailable",
        })
        .waitFor();
      await urlPage.close();
      assert.deepEqual(errors, [], `${name}: browser exceptions`);
      evidence.push({
        browser: name,
        version: browser.version(),
        completeReportParity: true,
        patchReviewApplyUndo: true,
        authoredFix: true,
        invalidInputBlocked: true,
        htmlDownload: true,
        nestedFolderReferences: true,
        baselineComparisonCancellation: true,
        handoffSourceVersion: true,
        openapi32FixUndo: true,
        swaggerConverterGuidance: true,
        explicitHostedSourceFetch: true,
        source403AndNetworkGuidance: true,
        accessibilityViolations: 0,
        externalRequests: 0,
        consoleErrors: errors,
        screenshots: [`${name}-desktop.png`, `${name}-mobile.png`],
      });
      console.log(
        `${name}: Rust parity, source navigation, patch/undo, authored fix, export, invalid input, accessibility, offline privacy and mobile layout passed`,
      );
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    "artifacts/browser/results.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
} finally {
  server.kill("SIGTERM");
}
