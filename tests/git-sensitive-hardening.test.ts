import { afterEach, describe, expect, it } from "vitest";
import { gitDiff } from "../src/workspace/git.js";
import { cleanup, git, makeGitRepo, makeTmpDir, write } from "./helpers.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
});

describe("git diff sensitive-path hardening", () => {
  it("does not expose newly denied Docker, Kubernetes, cloud or Terraform files", () => {
    const repo = makeTmpDir("git-hard-sensitive");
    dirs.push(repo);
    makeGitRepo(repo);

    const sensitive = [
      [".docker/config.json", "docker-secret"],
      [".kube/config", "kube-secret"],
      [".azure/credentials", "azure-secret"],
      [".config/gcloud/application_default_credentials.json", "gcloud-secret"],
      [".pypirc", "pypirc-secret"],
      ["terraform.tfstate", "tfstate-secret"],
      ["prod.tfstate.backup", "tfstate-backup-secret"],
      ["prod.tfvars", "tfvars-secret"],
      ["prod.tfvars.json", "tfvars-json-secret"],
      ["profile.mobileprovision", "mobileprovision-secret"],
    ] as const;

    for (const [file, sentinel] of sensitive) {
      write(repo, file, `${sentinel}\n`);
      git(repo, "add", "-f", file);
    }
    write(repo, "src/safe.ts", "export const safe = 1;\n");
    git(repo, "add", "src/safe.ts");

    const staged = gitDiff(repo, { mode: "staged" });
    expect(staged.diff).toContain("src/safe.ts");
    for (const [, sentinel] of sensitive) {
      expect(staged.diff).not.toContain(sentinel);
    }
  });
});
