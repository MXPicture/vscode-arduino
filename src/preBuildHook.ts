import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

export async function runCustomWarningFix(): Promise<void> {
  const disabled = vscode.workspace.getConfiguration("arduino.customWarningFix").get<boolean>("disabled");
  if (disabled) {
    vscode.window.showInformationMessage("Custom warning fix is disabled in settings.");
    return;
  }

  const arduinoJsonPath = path.join(vscode.workspace.rootPath ?? "", ".vscode", "arduino.json");
  if (!(await fs.pathExists(arduinoJsonPath))) {
    vscode.window.showWarningMessage(`Cannot find ${arduinoJsonPath}`);
    return;
  }

  const { fqbn } = await fs.readJson(arduinoJsonPath);
  if (!fqbn) {
    vscode.window.showWarningMessage(`FQBN not defined in arduino.json`);
    return;
  }

  const platformTxt = resolvePlatformTxt(fqbn);
  const backupPath = `${platformTxt}.bak`;

  const content = await fs.readFile(platformTxt, "utf8");
  const lines = content.split("\n");

  let modified = false;
  const newLines = lines.map(line => {
    if (line.startsWith("compiler.warning_flags=-w")) {
      if (!line.includes("custom hook")) {
        modified = true;
        return `compiler.warning_flags=  # modified at ${new Date().toISOString()} by custom hook`;
      }
    }
    if (line.startsWith("compiler.warning_flags.none=-w")) {
      if (!line.includes("custom hook")) {
        modified = true;
        return `compiler.warning_flags.none=  # modified at ${new Date().toISOString()} by custom hook`;
      }
    }
    return line;
  });

  if (!modified) {
    vscode.window.showInformationMessage("No platform.txt changes needed.");
    return;
  }

  if (!(await fs.pathExists(backupPath))) {
    await fs.copyFile(platformTxt, backupPath);
  }

  await fs.writeFile(platformTxt, newLines.join("\n"), "utf8");
  vscode.window.showInformationMessage("platform.txt was updated by custom warning fix.");
}

// Same logic as before
function resolvePlatformTxt(fqbn: string): string {
  const parts = fqbn.split(":");
  if (parts.length < 2) {
    throw new Error("Invalid FQBN");
  }
  const [vendor, arch] = parts;
  const root = process.platform === "darwin"
    ? path.join(os.homedir(), "Library/Arduino15", "packages")
    : path.join(os.homedir(), ".arduino15", "packages");
  const dir = path.join(root, vendor, "hardware", arch);
  const versions = fs.readdirSync(dir).filter(v => fs.statSync(path.join(dir, v)).isDirectory());
  if (versions.length === 0) throw new Error("No hardware version found");
  const latest = versions.sort().reverse()[0];
  return path.join(dir, latest, "platform.txt");
}
