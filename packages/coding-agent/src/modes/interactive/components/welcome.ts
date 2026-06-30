import { type Component, truncateToWidth, visibleWidth } from "@codevaani7838/pie-tui";
import { APP_NAME } from "../../../config.ts";
import { theme } from "../theme/theme.ts";

const PI_LOGO = [
	"██████╗ ███████╗",
	"██╔══██╗██╔════╝",
	"██████╔╝█████╗  ",
	"██╔═══╝ ██╔══╝  ",
	"██║     ███████╗",
	"╚═╝     ╚══════╝",
];

const BOX = {
	topLeft: "┌",
	topRight: "┐",
	bottomLeft: "└",
	bottomRight: "┘",
	horizontal: "─",
	vertical: "│",
	teeUp: "┴",
};

const TIPS: readonly string[] = [
	"Press . (dot) to keep going without typing more",
	"Use /model to switch models mid-session",
	"Ctrl+D saves draft and exits",
	"Drop files onto the terminal to attach them",
	"Use ! to run bash commands inline",
	"Press ? for keyboard shortcuts",
	"/compact to compress context when it gets long",
];

export interface WelcomeResourceSummary {
	context: string[];
	skills: string[];
	extensions: string[];
}

export interface WelcomeUpdateNotice {
	version: string;
	command: string;
}

export interface WelcomeComponentOptions {
	version: string;
	modelName: string;
	providerName: string;
	recentSessions?: Array<{ name: string; timeAgo: string }>;
	resources?: WelcomeResourceSummary;
	updateNotice?: WelcomeUpdateNotice;
}

function pickTip(): string {
	if (TIPS.length === 0) return "";
	return TIPS[Math.floor(Math.random() * TIPS.length)] ?? "";
}

function centerText(text: string, width: number): string {
	const visLen = visibleWidth(text);
	if (visLen >= width) return truncateToWidth(text, width);
	const leftPad = Math.floor((width - visLen) / 2);
	const rightPad = width - visLen - leftPad;
	return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

function fitToWidth(str: string, width: number): string {
	const visLen = visibleWidth(str);
	if (visLen > width) return truncateToWidth(str, width, "…");
	return str + " ".repeat(width - visLen);
}

function styledBorder(text: string): string {
	return theme.fg("dim", text);
}

function sectionTitle(title: string): string {
	return theme.bold(theme.fg("accent", title));
}

export class WelcomeComponent implements Component {
	private version: string;
	private modelName: string;
	private providerName: string;
	private recentSessions: Array<{ name: string; timeAgo: string }>;
	private resources: WelcomeResourceSummary;
	private updateNotice: WelcomeUpdateNotice | undefined;
	private selectedTip: string;
	private cachedWidth = -1;
	private cachedLines: string[] | undefined;

	constructor(options: WelcomeComponentOptions) {
		this.version = options.version;
		this.modelName = options.modelName;
		this.providerName = options.providerName;
		this.recentSessions = options.recentSessions ?? [];
		this.resources = options.resources ?? { context: [], skills: [], extensions: [] };
		this.updateNotice = options.updateNotice;
		this.selectedTip = pickTip();
	}

	setModel(modelName: string, providerName: string): void {
		this.modelName = modelName;
		this.providerName = providerName;
		this.invalidate();
	}

	setResources(resources: WelcomeResourceSummary): void {
		this.resources = resources;
		this.invalidate();
	}

	setUpdateNotice(updateNotice: WelcomeUpdateNotice | undefined): void {
		this.updateNotice = updateNotice;
		this.invalidate();
	}

	invalidate(): void {
		this.cachedWidth = -1;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const lines = this.renderLines(width);
		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}

	private renderLines(termWidth: number): string[] {
		const boxWidth = Math.min(120, Math.max(0, termWidth - 2));
		if (boxWidth < 10) return this.renderMinimalHeader();
		if (boxWidth < 76) return this.renderTwoColumnHeader(boxWidth);

		const contentWidth = boxWidth - 4;
		const leftCol = Math.min(30, Math.max(24, Math.floor(contentWidth * 0.25)));
		const rightCol = Math.min(28, Math.max(22, Math.floor(contentWidth * 0.24)));
		const middleCol = Math.max(1, contentWidth - leftCol - rightCol);
		const leftLines = this.renderLeftColumn(leftCol);
		const middleLines = this.renderMiddleColumn(middleCol);
		const rightLines = this.renderResourceColumn(rightCol);
		const maxRows = Math.max(leftLines.length, middleLines.length, rightLines.length);
		const lines = [this.renderTopBorder(boxWidth)];

		for (let i = 0; i < maxRows; i++) {
			lines.push(
				BOX.vertical +
					fitToWidth(leftLines[i] ?? "", leftCol) +
					BOX.vertical +
					fitToWidth(middleLines[i] ?? "", middleCol) +
					BOX.vertical +
					fitToWidth(rightLines[i] ?? "", rightCol) +
					BOX.vertical,
			);
		}

		lines.push(this.renderBottomBorder([leftCol, middleCol, rightCol]));
		this.appendTipLine(lines, boxWidth);
		return lines;
	}

	private renderLeftColumn(width: number): string[] {
		const lines = [
			"",
			"",
			...PI_LOGO.map((line) => centerText(theme.fg("accent", line), width)),
			"",
			centerText(theme.fg("muted", this.modelName), width),
			centerText(theme.fg("dim", this.providerName), width),
		];
		if (this.updateNotice) {
			const commandName = this.updateNotice.command.replace(/^run\s+/, "");
			lines.push(
				"",
				centerText(theme.bold(theme.fg("warning", "Update Available")), width),
				centerText(theme.fg("muted", `New version ${this.updateNotice.version}`), width),
				centerText(theme.fg("accent", commandName), width),
			);
		}
		return lines;
	}

	private renderMiddleColumn(width: number): string[] {
		const separator = styledBorder(BOX.horizontal.repeat(width));
		const lines = [
			` ${sectionTitle("Tips")}`,
			` ${theme.fg("dim", "?")} ${theme.fg("muted", "for keyboard shortcuts")}`,
			` ${theme.fg("dim", "#")} ${theme.fg("muted", "for prompt actions")}`,
			` ${theme.fg("dim", "/")} ${theme.fg("muted", "for commands")}`,
			` ${theme.fg("dim", "!")} ${theme.fg("muted", "to run bash")}`,
			` ${theme.fg("dim", "$")} ${theme.fg("muted", "to run python")}`,
			separator,
			` ${sectionTitle("Shortcuts")}`,
			` ${theme.fg("dim", "Ctrl+C")} ${theme.fg("muted", "interrupt")}`,
			` ${theme.fg("dim", "Ctrl+D")} ${theme.fg("muted", "exit (save draft)")}`,
			` ${theme.fg("dim", "/compact")} ${theme.fg("muted", "compress context")}`,
			separator,
			` ${sectionTitle("Recent sessions")}`,
		];
		if (this.recentSessions.length === 0) {
			lines.push(` ${theme.fg("dim", "No recent sessions")}`);
		} else {
			for (const session of this.recentSessions.slice(0, 4)) {
				lines.push(
					` ${theme.fg("dim", "•")} ${theme.fg("muted", session.name)} ${theme.fg("dim", `(${session.timeAgo})`)}`,
				);
			}
		}
		return lines;
	}

	// Middle column separator positions (rows 6 and 11):
	// Row 0: Tips title, Rows 1-5: tip items, Row 6: separator
	// Row 7: Shortcuts title, Rows 8-10: shortcut items, Row 11: separator
	// Row 12: Recent sessions title, Row 13: session items
	private static readonly MIDDLE_SEPARATOR_ROWS = [6, 11];

	private renderResourceColumn(width: number): string[] {
		const separator = styledBorder(BOX.horizontal.repeat(width));
		const sections = [
			{ title: "Context", items: this.resources.context },
			{ title: "Skills", items: this.resources.skills },
			{ title: "Extensions", items: this.resources.extensions },
		];
		const separatorRows = WelcomeComponent.MIDDLE_SEPARATOR_ROWS;
		const lines: string[] = [];
		let currentRow = 0;

		for (let s = 0; s < sections.length; s++) {
			const section = sections[s]!;
			const sectionLines = this.renderResourceSection(section.title, section.items, width);
			const nextSeparatorRow = separatorRows[s];

			// If there is a separator after this section, pad to fill rows up to it
			if (nextSeparatorRow !== undefined) {
				const availableRows = nextSeparatorRow - currentRow;
				const linesToShow = sectionLines.slice(0, availableRows);
				lines.push(...linesToShow);
				// Pad remaining rows with empty content
				while (lines.length < nextSeparatorRow) {
					lines.push(" ");
				}
				lines.push(separator);
				currentRow = nextSeparatorRow + 1;
			} else {
				lines.push(...sectionLines);
			}
		}
		return lines;
	}

	private renderResourceSection(title: string, items: string[], width: number): string[] {
		const budget = Math.max(1, width - 2);
		const lines = [` ${sectionTitle(`[${title}]`)}`];
		if (items.length === 0) {
			lines.push(` ${theme.fg("dim", "None")}`);
			return lines;
		}
		for (const item of items) {
			lines.push(` ${theme.fg("dim", truncateToWidth(item, budget, "…"))}`);
		}
		return lines;
	}

	private renderTwoColumnHeader(boxWidth: number): string[] {
		const innerWidth = boxWidth - 2;
		const contentWidth = boxWidth - 3;
		const leftCol = Math.min(28, Math.max(14, Math.floor(contentWidth * 0.38)));
		const rightCol = Math.max(1, contentWidth - leftCol);
		const showRightColumn = rightCol >= 22;
		const leftLines = this.renderLeftColumn(showRightColumn ? leftCol : innerWidth);
		const rightLines = this.renderMiddleColumn(rightCol);
		const maxRows = showRightColumn ? Math.max(leftLines.length, rightLines.length) : leftLines.length;
		const lines = [this.renderTopBorder(boxWidth)];
		for (let i = 0; i < maxRows; i++) {
			const left = fitToWidth(leftLines[i] ?? "", showRightColumn ? leftCol : innerWidth);
			if (showRightColumn) {
				lines.push(BOX.vertical + left + BOX.vertical + fitToWidth(rightLines[i] ?? "", rightCol) + BOX.vertical);
			} else {
				lines.push(BOX.vertical + left + BOX.vertical);
			}
		}
		lines.push(this.renderBottomBorder(showRightColumn ? [leftCol, rightCol] : [innerWidth]));
		this.appendTipLine(lines, boxWidth);
		return lines;
	}

	private renderTopBorder(boxWidth: number): string {
		const title = ` ${APP_NAME} v${this.version} `;
		const titlePrefix = BOX.horizontal.repeat(3);
		const titleStyled = styledBorder(titlePrefix) + theme.fg("muted", title);
		const titleVisLen = visibleWidth(titlePrefix) + visibleWidth(title);
		const titleSpace = boxWidth - 2;
		if (titleVisLen >= titleSpace) {
			return BOX.topLeft + truncateToWidth(titleStyled, titleSpace) + BOX.topRight;
		}
		return BOX.topLeft + titleStyled + styledBorder(BOX.horizontal.repeat(titleSpace - titleVisLen)) + BOX.topRight;
	}

	private renderBottomBorder(columns: number[]): string {
		return (
			BOX.bottomLeft +
			columns.map((column) => styledBorder(BOX.horizontal.repeat(column))).join(BOX.teeUp) +
			BOX.bottomRight
		);
	}

	private appendTipLine(lines: string[], boxWidth: number): void {
		if (!this.selectedTip) return;
		const tipText = `${theme.italic(theme.fg("muted", "Tip: "))}${theme.fg("dim", this.selectedTip)}`;
		lines.push("");
		lines.push(` ${truncateToWidth(tipText, boxWidth - 1)}`);
	}

	private renderMinimalHeader(): string[] {
		return [theme.bold(theme.fg("accent", APP_NAME)) + theme.fg("dim", ` v${this.version}`)];
	}
}
