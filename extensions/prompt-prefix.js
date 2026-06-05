// Adds "> " prefix to the input editor

import { CustomEditor } from "@earendil-works/pi-coding-agent";

class PromptEditor extends CustomEditor {
  render(width) {
    const lines = super.render(width);

    return lines.map((line, i) => {
      // lines: [0] top-border, [1..n-?] content, [n-?+1..] bottom-border + autocomplete
      // Content lines start with padding spaces; border lines are "─" chars
      if (i === 0) return line; // top border

      // Check if this looks like a content line (starts with spaces = padding)
      if (line.startsWith("  ")) {
        // First content line gets colored "> "
        if (i === 1) {
          return "\x1b[1;36m❯\x1b[0m " + line.slice(2);
        }
      }

      return line;
    });
  }
}

export default function (pi) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new PromptEditor(tui, theme, keybindings)
    );
  });
}
