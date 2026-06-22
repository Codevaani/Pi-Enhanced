import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pie-tui";
import type { AgentSession } from "../../../core/agent-session.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { theme } from "../theme/theme.ts";

// ============================================================================
// Box-drawing characters (rounded style)
// ============================================================================

const BOX = {
	topLeft: "╭",
	topRight: "╮",
	horizontal: "─",
};

// ============================================================================
// Helper functions
// ============================================================================

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000)}M`;
}

function formatCwd(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const relative = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	return relative || "~";
}

// ============================================================================
// StatusBarComponent — renders the status line above the editor
// ============================================================================

export class StatusBarComponent implements Component {
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;
	private autoCompactEnabled = true;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider) {
		this.session = session;
		this.footerData = footerData;
	}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	invalidate(): void {
		// No cached state
	}

	render(width: number): string[] {
		if (width < 20) return [];

		const state = this.session.state;

		// Calculate context usage
		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";

		// Format context display
		const contextDisplay =
			contextUsage?.percent !== null
				? `${contextPercentValue.toFixed(1)}%/${formatTokens(contextWindow)}${autoIndicator}`
				: `?/${formatTokens(contextWindow)}${autoIndicator}`;

		// Colorize context based on usage
		let contextStr: string;
		if (contextPercentValue > 90) {
			contextStr = theme.fg("error", contextDisplay);
		} else if (contextPercentValue > 70) {
			contextStr = theme.fg("warning", contextDisplay);
		} else {
			contextStr = contextDisplay;
		}

		// Get model info
		const modelName = state.model?.id ?? "no-model";

		// Get thinking level
		const thinkingLevel = state.thinkingLevel || "off";

		// Get CWD
		const cwd = formatCwd(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);

		// Get git branch
		const branch = this.footerData.getGitBranch();

		// Get subscription status
		const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;

		// Build status segments
		const segments: string[] = [];

		// π symbol + model
		segments.push(theme.fg("accent", "π"));
		segments.push(">");
		segments.push(theme.fg("accent", "⬢"));
		segments.push(theme.fg("muted", modelName));

		// Thinking level
		if (state.model?.reasoning) {
			segments.push("·");
			const thinkingIcon = thinkingLevel === "off" ? "◕" : "●";
			segments.push(theme.fg("muted", `${thinkingIcon} ${thinkingLevel}`));
		}

		// Path
		segments.push("·");
		segments.push(theme.fg("muted", `🗑 ${cwd}${branch ? ` (${branch})` : ""}`));

		// Context usage
		segments.push("·");
		segments.push(theme.fg("muted", `◫ ${contextStr}`));

		// Subscription
		if (usingSubscription) {
			segments.push("·");
			segments.push(theme.fg("muted", "⟲ (sub)"));
		}

		// Join segments
		const statusText = segments.join(" ");

		// Calculate width explicitly
		// Each segment is " segment " format, so we need to count carefully
		let calculatedWidth = 0;
		for (const seg of segments) {
			calculatedWidth += visibleWidth(seg);
		}
		// Add spaces between segments (segments.length - 1 spaces)
		calculatedWidth += segments.length - 1;

		// Total width = corners + status + padding = width
		// So padding = width - corners - status
		const paddingNeeded = Math.max(0, width - calculatedWidth - 2); // 2 for ╭ and ╮

		// Build the status bar with box borders
		const topLeft = theme.fg("dim", BOX.topLeft);
		const topRight = theme.fg("dim", BOX.topRight);
		const horizontal = theme.fg("dim", BOX.horizontal);

		const statusBar = `${topLeft}${statusText}${horizontal.repeat(paddingNeeded)}${topRight}`;

		// Safety: truncate to exact terminal width to prevent overflow
		return [truncateToWidth(statusBar, width)];
	}
}
