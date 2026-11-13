// The agent skill's patterns.md from src/recipes (TODO 136.5): one source for the site's
// recipes.md and the skill. Run after editing a recipe; tests/unit/docs-reference.test.js checks
// that the files are current. It also writes the chained-pipeline skill (TODO 144):
// eval/agent-tasks/variants/fluent/skill, the same skill with its data pipelines written as chains,
// for the eval only (skills/ is the plugin, which ships the standard skill alone).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { patternsMarkdown } from "../src/routes/examples/docsMarkdown.server.js";
import { fluentSkill, fluentTranslation } from "../src/routes/examples/fluentDocs.js";

writeFileSync("skills/hmplot/patterns.md", patternsMarkdown({ style: "standard" }));
const FLUENT = "eval/agent-tasks/variants/fluent/skill";
mkdirSync(FLUENT, { recursive: true });
writeFileSync(`${FLUENT}/patterns.md`, patternsMarkdown({ style: "fluent" }));
writeFileSync(`${FLUENT}/SKILL.md`, fluentSkill(readFileSync("skills/hmplot/SKILL.md", "utf8")));
writeFileSync(`${FLUENT}/svelte.md`, readFileSync("skills/hmplot/svelte.md", "utf8"));
writeFileSync(`${FLUENT}/translation.md`, fluentTranslation(readFileSync("skills/hmplot/translation.md", "utf8")));
