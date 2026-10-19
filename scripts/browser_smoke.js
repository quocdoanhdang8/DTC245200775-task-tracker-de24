#!/usr/bin/env node
// Real Chromium UI smoke test against Express with an isolated in-memory DB fixture.
// It does not connect to the user's Docker stack or modify real tasks.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../app/src/server");

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  let nextId = 1;
  let tasks = [];
  let failNextUpdate = false;
  const database = {
    async query(sql, params = []) {
      if (sql === "SELECT 1") return { rows: [{}], rowCount: 1 };
      if (sql.includes("INSERT INTO tasks")) {
        const [title, description, dueDate, status, priority] = params;
        const task = { id: String(nextId++), title, description, dueDate, status, priority };
        tasks.push(task); return { rows: [task], rowCount: 1 };
      }
      if (sql.startsWith("SELECT")) {
        const rows = sql.includes("WHERE") ? tasks.filter(task => task.status === params[0]) : [...tasks];
        return { rows, rowCount: rows.length };
      }
      const task = tasks.find(item => item.id === params.at(-1));
      if (!task) return { rows: [], rowCount: 0 };
      if (sql.startsWith("DELETE")) {
        tasks = tasks.filter(item => item !== task); return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE")) {
        if (failNextUpdate) { failNextUpdate = false; throw new Error("Simulated update failure"); }
        const names = { title: "title", description: "description", due_date: "dueDate", status: "status", priority: "priority" };
        for (const [, column, index] of sql.matchAll(/(title|description|due_date|status|priority) = \$(\d+)/g)) task[names[column]] = params[Number(index) - 1];
        return { rows: [{ ...task }], rowCount: 1 };
      }
      throw new Error("Unhandled fixture SQL");
    }
  };
  const server = http.createServer(createApp({ database }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
      args: ["--disable-gpu", "--disable-software-rasterizer", ...(process.env.BROWSER_SINGLE_PROCESS === "1" ? ["--no-zygote", "--single-process"] : [])],
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".empty").filter({ hasText: "Chưa có công việc" }).waitFor();
    console.log("PASS browser: initial empty list");

    const title = '<img src=x onerror="window.__qaXss=1">';
    await page.locator("#title").fill(title);
    await page.locator("#dueDate").fill("2026-10-31");
    await page.locator("#status").selectOption("in_progress");
    await page.locator("#priority").selectOption("high");
    await page.locator("#submit-button").click();
    await page.locator(".task-title").filter({ hasText: title }).waitFor();
    assert.equal(await page.locator(".task img").count(), 0);
    assert.notEqual(await page.evaluate(() => window.__qaXss), 1);
    assert.match(await page.locator(".task-meta").innerText(), /2026-10-31/);
    console.log("PASS browser: create, deadline display and HTML escaping");

    await page.getByRole("button", { name: "Sửa công việc" }).click();
    assert.equal(await page.locator("#dueDate").inputValue(), "2026-10-31");
    await page.locator("#title").fill("Browser QA updated");
    await page.locator("#status").selectOption("done");
    await page.locator("#submit-button").click();
    await page.locator(".task-title").filter({ hasText: "Browser QA updated" }).waitFor();
    assert.ok(await page.locator(".task-check").isChecked());
    console.log("PASS browser: edit task and preserve deadline");

    await page.locator("#status-filter").selectOption("in_progress");
    await page.locator(".empty").filter({ hasText: "Chưa có công việc" }).waitFor();
    await page.locator("#status-filter").selectOption("");
    await page.locator(".task-title").waitFor();
    console.log("PASS browser: filter status and restore all tasks");

    failNextUpdate = true;
    await Promise.all([
      page.waitForResponse(response => response.request().method() === "PATCH" && response.status() === 500),
      page.locator(".task-check").click()
    ]);
    await page.waitForFunction(() => document.querySelector(".task-check")?.checked === true);
    assert.equal(tasks[0].status, "done");
    console.log("PASS browser: failed update restores the checkbox state");

    await page.locator(".task-check").uncheck();
    await page.locator(".pill.todo").waitFor();
    console.log("PASS browser: toggle completion");
    await page.getByRole("button", { name: "Xóa công việc" }).click();
    await page.locator(".empty").filter({ hasText: "Chưa có công việc" }).waitFor();
    assert.equal(tasks.length, 0);
    console.log("PASS browser: delete and cleanup");

    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}px`);
      console.log(`PASS browser: responsive width ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log("PASS browser: no uncaught page errors; isolated fixture only, no Docker runtime claim");
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
