import { spawn } from "node:child_process";

const children = [];

function run(name, command, args) {
  const isWindows = process.platform === "win32";
  const child = isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        stdio: "inherit",
        shell: false
      })
    : spawn(command, args, {
        stdio: "inherit",
        shell: false
      });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] finalizou com codigo ${code}`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}] erro:`, error.message);
    shutdown(1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("web", "npm.cmd", ["run", "dev:web"]);
run("php", "npm.cmd", ["run", "dev:php"]);
