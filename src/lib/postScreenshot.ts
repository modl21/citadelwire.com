import { format } from 'date-fns';
import type { NostrEvent } from '@nostrify/nostrify';
import type { PostType } from '@/hooks/useCitadelFeed';
import { getPostUtcSlug } from '@/lib/nostrPost';

interface StyledRun {
  text: string;
  font: string;
  color: string;
}

interface DrawOp {
  type: 'line' | 'rule' | 'pill' | 'bullet' | 'subdash' | 'accent';
  x: number;
  y: number;
  runs?: StyledRun[];
  x2?: number;
  color?: string;
  text?: string;
  font?: string;
  bg?: string;
  border?: string;
  height?: number;
}

interface Palette {
  outerBg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  bodyText: string;
  mutedText: string;
  subtleText: string;
  linkText: string;
  ruleColor: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
}

const POST_TYPE_COLORS_DARK: Record<PostType, { accent: string; badgeBg: string; badgeText: string }> = {
  'standard': { accent: '#f59e0b', badgeBg: 'rgba(245, 158, 11, 0.14)', badgeText: '#fcd34d' },
  'live-wire': { accent: '#f87171', badgeBg: 'rgba(248, 113, 113, 0.16)', badgeText: '#fca5a5' },
  'code-wire': { accent: '#facc15', badgeBg: 'rgba(250, 204, 21, 0.15)', badgeText: '#fde047' },
  'daily-wire': { accent: '#34d399', badgeBg: 'rgba(52, 211, 153, 0.15)', badgeText: '#6ee7b7' },
  'weekly-wire': { accent: '#38bdf8', badgeBg: 'rgba(56, 189, 248, 0.15)', badgeText: '#7dd3fc' },
  'forward-wire': { accent: '#fb923c', badgeBg: 'rgba(251, 146, 60, 0.15)', badgeText: '#fdba74' },
  'editor-wire': { accent: '#22d3ee', badgeBg: 'rgba(34, 211, 238, 0.16)', badgeText: '#67e8f9' },
};

const POST_TYPE_COLORS_LIGHT: Record<PostType, { accent: string; badgeBg: string; badgeText: string }> = {
  'standard': { accent: '#b45309', badgeBg: 'rgba(180, 83, 9, 0.10)', badgeText: '#92400e' },
  'live-wire': { accent: '#b91c1c', badgeBg: 'rgba(185, 28, 28, 0.10)', badgeText: '#991b1b' },
  'code-wire': { accent: '#a16207', badgeBg: 'rgba(161, 98, 7, 0.10)', badgeText: '#854d0e' },
  'daily-wire': { accent: '#047857', badgeBg: 'rgba(4, 120, 87, 0.10)', badgeText: '#065f46' },
  'weekly-wire': { accent: '#0369a1', badgeBg: 'rgba(3, 105, 161, 0.10)', badgeText: '#075985' },
  'forward-wire': { accent: '#c2410c', badgeBg: 'rgba(194, 65, 12, 0.10)', badgeText: '#9a3412' },
  'editor-wire': { accent: '#0e7490', badgeBg: 'rgba(14, 116, 144, 0.10)', badgeText: '#155e75' },
};

function getPalette(postType: PostType, isLight: boolean): Palette {
  const accentSet = isLight ? POST_TYPE_COLORS_LIGHT[postType] : POST_TYPE_COLORS_DARK[postType];
  if (isLight) {
    return {
      outerBg: '#f3f1eb',
      cardBg: '#ffffff',
      cardBorder: '#e2ded5',
      text: '#141821',
      bodyText: '#232938',
      mutedText: '#606878',
      subtleText: '#8a92a1',
      linkText: '#1d6ce0',
      ruleColor: '#e7e3da',
      ...accentSet,
    };
  }
  return {
    outerBg: '#080b12',
    cardBg: '#0e121b',
    cardBorder: '#1f2636',
    text: '#f3f5f8',
    bodyText: '#dce1ea',
    mutedText: '#8e98aa',
    subtleText: '#5e687a',
    linkText: '#60a5fa',
    ruleColor: '#1d2433',
    ...accentSet,
  };
}

const FONT_FAMILY = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function fontSpec(weight: number, sizePx: number, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${sizePx}px ${FONT_FAMILY}`;
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)/g, (_m, prefix, data) => `@${prefix}${data.slice(0, 12)}…`);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname.replace(/^www\./, '') + (parsed.pathname === '/' ? '' : parsed.pathname);
    return display.length > 60 ? `${display.slice(0, 57)}…` : display;
  } catch {
    return url;
  }
}

function isTitleLine(line: string, lineIndex: number, allLines: string[]): boolean {
  const trimmed = line.trim();
  if (!trimmed || lineIndex > 2 || trimmed.length > 120) return false;
  if (trimmed.endsWith('.') && !trimmed.match(/\d+\./)) return false;
  const nextContentLine = allLines.slice(lineIndex + 1).find((l) => l.trim().length > 0);
  if (!nextContentLine) return false;
  const hasEmoji = /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/u.test(trimmed);
  const isShort = trimmed.length < 80;
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  const isMostlyUppercase = letters.length > 3 && trimmed.replace(/[^A-Z]/g, '').length / letters.length > 0.6;
  return (hasEmoji && isShort) || isMostlyUppercase || (lineIndex === 0 && isShort && !trimmed.match(/^\d+[.)]/));
}

function isNumberedListItem(line: string): boolean {
  return /^\s*\d+[.)]\s/.test(line);
}

function isBulletListItem(line: string): boolean {
  return /^\s*[-•–]\s/.test(line);
}

function isSubItem(line: string): boolean {
  return /^\s*--\s/.test(line);
}

/** Word-wrap styled runs onto lines that fit within maxWidth. */
function wrapRuns(
  ctx: CanvasRenderingContext2D,
  runs: StyledRun[],
  maxWidth: number,
): StyledRun[][] {
  // Split each run into whitespace-preserving tokens so bold/regular segments flow seamlessly.
  const tokens: StyledRun[] = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      tokens.push({ text: part, font: run.font, color: run.color });
    }
  }

  const lines: StyledRun[][] = [];
  let currentLine: StyledRun[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    if (currentLine.length === 0) return;
    // Trim trailing whitespace token
    const last = currentLine[currentLine.length - 1];
    if (last && /^\s+$/.test(last.text)) currentLine.pop();
    if (currentLine.length > 0) lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  for (const token of tokens) {
    const isSpace = /^\s+$/.test(token.text);
    if (isSpace && currentLine.length === 0) continue;

    ctx.font = token.font;
    const tokenWidth = ctx.measureText(token.text).width;

    if (!isSpace && currentWidth + tokenWidth > maxWidth && currentLine.length > 0) {
      pushLine();
    }

    // Break an overlong single token (e.g. long URL) by characters
    if (!isSpace && tokenWidth > maxWidth) {
      let chunk = '';
      for (const ch of token.text) {
        const nextChunk = chunk + ch;
        if (ctx.measureText(nextChunk).width > maxWidth && chunk.length > 0) {
          currentLine.push({ text: chunk, font: token.font, color: token.color });
          pushLine();
          chunk = ch;
        } else {
          chunk = nextChunk;
        }
      }
      if (chunk) {
        currentLine.push({ text: chunk, font: token.font, color: token.color });
        currentWidth = ctx.measureText(chunk).width;
      }
      continue;
    }

    currentLine.push(token);
    currentWidth += tokenWidth;
  }

  pushLine();
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render a complete, crisp, high-DPI PNG screenshot of a wire post with a
 * CITADEL WIRE / citadelwire.com brand header & footer watermark.
 */
export async function renderPostScreenshotPng(
  event: NostrEvent,
  postType: PostType,
): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');
  const palette = getPalette(postType, isLight);
  const isEditorWire = postType === 'editor-wire';

  const WIDTH = 760;
  const OUTER_PAD = 28;
  const CARD_X = OUTER_PAD;
  const CARD_W = WIDTH - OUTER_PAD * 2;
  const INNER_PAD_X = 36;
  const CONTENT_X = CARD_X + INNER_PAD_X;
  const CONTENT_W = CARD_W - INNER_PAD_X * 2;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('Canvas 2D context unavailable');

  const ops: DrawOp[] = [];
  let y = OUTER_PAD + 34;

  // ── Top header row: type badge + timestamp + subtle brand mark ──
  const typeLabel = postType === 'standard' ? 'MAIN WIRE' : postType.replace('-', ' ').toUpperCase();
  const absoluteTime = format(new Date(event.created_at * 1000), 'MMM d, yyyy · h:mm a');

  mctx.font = fontSpec(800, 11);
  const badgeTextW = mctx.measureText(typeLabel).width;
  const badgePadX = 10;
  const badgeH = 22;
  const badgeW = badgeTextW + badgePadX * 2;

  ops.push({
    type: 'pill',
    x: CONTENT_X,
    y: y - 15,
    x2: badgeW,
    height: badgeH,
    bg: palette.badgeBg,
    color: palette.badgeText,
    text: typeLabel,
    font: fontSpec(800, 11),
  });

  ops.push({
    type: 'line',
    x: CONTENT_X + badgeW + 12,
    y,
    runs: [{ text: absoluteTime, font: fontSpec(500, 12), color: palette.mutedText }],
  });

  const topWatermark = 'citadelwire.com';
  mctx.font = fontSpec(700, 12);
  const topWatermarkW = mctx.measureText(topWatermark).width;
  ops.push({
    type: 'line',
    x: CONTENT_X + CONTENT_W - topWatermarkW,
    y,
    runs: [{ text: topWatermark, font: fontSpec(700, 12), color: palette.accent }],
  });

  y += 22;
  ops.push({
    type: 'rule',
    x: CONTENT_X,
    y,
    x2: CONTENT_X + CONTENT_W,
    color: palette.ruleColor,
  });
  y += 28;

  // Helper to append wrapped text runs
  const addWrapped = (
    runs: StyledRun[],
    xOffset: number,
    lineHeight: number,
    gapAfter: number,
    prefixOp?: (firstLineY: number) => void,
  ) => {
    const wrapped = wrapRuns(mctx, runs, CONTENT_W - xOffset);
    wrapped.forEach((lineRuns, idx) => {
      if (idx === 0 && prefixOp) prefixOp(y);
      ops.push({ type: 'line', x: CONTENT_X + xOffset, y, runs: lineRuns });
      y += lineHeight;
    });
    if (wrapped.length > 0) y += gapAfter;
  };

  // Helper to lay out standard body lines (titles, lists, sub-items, blockquotes, paragraphs)
  const layoutStandardLines = (lines: string[], forceFirstLineAsHeadline = false) => {
    let i = 0;
    let handledFirstTextLine = false;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        i++;
        continue;
      }

      if (forceFirstLineAsHeadline && !handledFirstTextLine) {
        handledFirstTextLine = true;
        addWrapped(
          [{ text: cleanInlineMarkdown(trimmed), font: fontSpec(700, 19), color: palette.text }],
          0,
          27,
          12,
        );
        i++;
        continue;
      }

      // Header / title line
      if (!forceFirstLineAsHeadline && isTitleLine(trimmed, i, lines)) {
        const titleColor = postType === 'standard' ? palette.text : palette.accent;
        addWrapped(
          [{ text: cleanInlineMarkdown(trimmed), font: fontSpec(800, 14), color: titleColor }],
          0,
          21,
          8,
        );
        i++;
        continue;
      }

      // Numbered or bullet list item
      if (isNumberedListItem(trimmed) || isBulletListItem(trimmed)) {
        while (
          i < lines.length &&
          (isNumberedListItem(lines[i].trim()) || isBulletListItem(lines[i].trim()) || isSubItem(lines[i].trim()))
        ) {
          const cur = lines[i].trim();
          if (isSubItem(cur)) {
            const subText = cleanInlineMarkdown(cur.replace(/^\s*--\s*/, ''));
            addWrapped(
              [{ text: subText, font: fontSpec(400, 14), color: palette.mutedText }],
              32,
              21,
              6,
              (firstY) => {
                ops.push({
                  type: 'subdash',
                  x: CONTENT_X + 18,
                  y: firstY,
                  color: palette.subtleText,
                });
              },
            );
          } else {
            const rawItem = cur.replace(/^\d+[.)]\s*/, '').replace(/^[-•–]\s*/, '');
            const catMatch = rawItem.match(/^(\*{0,2})([^:–—\-\n]{2,50}?)(\*{0,2})\s*[:–—\-]\s+(.+)$/s);
            const itemRuns: StyledRun[] = catMatch
              ? [
                { text: `${catMatch[2].trim()} — `, font: fontSpec(700, 15.5), color: palette.text },
                { text: cleanInlineMarkdown(catMatch[4].trim()), font: fontSpec(600, 15.5), color: palette.text },
              ]
              : [{ text: cleanInlineMarkdown(rawItem), font: fontSpec(600, 15.5), color: palette.text }];

            addWrapped(
              itemRuns,
              18,
              23,
              6,
              (firstY) => {
                ops.push({
                  type: 'bullet',
                  x: CONTENT_X + 5,
                  y: firstY - 5,
                  color: palette.accent,
                });
              },
            );
          }
          i++;
        }
        y += 6;
        continue;
      }

      // Standalone sub-items
      if (isSubItem(trimmed)) {
        while (i < lines.length && isSubItem(lines[i].trim())) {
          const subText = cleanInlineMarkdown(lines[i].trim().replace(/^\s*--\s*/, ''));
          addWrapped(
            [{ text: subText, font: fontSpec(400, 14), color: palette.mutedText }],
            26,
            21,
            6,
            (firstY) => {
              ops.push({
                type: 'subdash',
                x: CONTENT_X + 12,
                y: firstY,
                color: palette.subtleText,
              });
            },
          );
          i++;
        }
        y += 6;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
          i++;
        }
        const quoteStartY = y - 13;
        addWrapped(
          [{ text: cleanInlineMarkdown(quoteLines.join(' ')), font: fontSpec(400, 14.5, true), color: palette.mutedText }],
          16,
          22,
          10,
        );
        ops.push({
          type: 'accent',
          x: CONTENT_X,
          y: quoteStartY,
          height: Math.max(16, y - quoteStartY - 14),
          color: palette.ruleColor,
        });
        continue;
      }

      // Regular paragraph
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !isNumberedListItem(lines[i].trim()) &&
        !isBulletListItem(lines[i].trim()) &&
        !isSubItem(lines[i].trim()) &&
        !lines[i].trim().startsWith('>') &&
        (forceFirstLineAsHeadline || !isTitleLine(lines[i].trim(), i, lines))
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }

      if (paraLines.length > 0) {
        const text = cleanInlineMarkdown(paraLines.join(' '));
        const isSectionHeader = text.length <= 24 && text === text.toUpperCase() && /[A-Z]/.test(text);
        addWrapped(
          [
            {
              text,
              font: isSectionHeader ? fontSpec(800, 12) : fontSpec(400, 15.5),
              color: isSectionHeader ? palette.mutedText : palette.bodyText,
            },
          ],
          0,
          isSectionHeader ? 20 : 24,
          isSectionHeader ? 6 : 11,
        );
      }
    }
  };

  // ── Body layout ──
  const allLines = event.content.split('\n');
  if (isEditorWire) {
    const sourcesIdx = allLines.findIndex((line) => /^\s*(?:#{1,6}\s*)?sources:?\s*$/i.test(line));
    const bodyLines = sourcesIdx === -1 ? allLines : allLines.slice(0, sourcesIdx);
    const sourceLines = sourcesIdx === -1 ? [] : allLines.slice(sourcesIdx + 1);

    // Header metadata lines ("EDITOR WIRE | ..." + "BITCOIN $...")
    let headerIdx = 0;
    const skipBlank = () => { while (headerIdx < bodyLines.length && !bodyLines[headerIdx].trim()) headerIdx++; };
    skipBlank();
    if (headerIdx < bodyLines.length && /^editor\s*wire\b/i.test(bodyLines[headerIdx].trim())) {
      addWrapped(
        [{ text: bodyLines[headerIdx].trim(), font: fontSpec(800, 13.5), color: palette.accent }],
        0,
        20,
        4,
      );
      headerIdx++;
      skipBlank();
    }
    if (headerIdx < bodyLines.length && /^bitcoin\s*\$/i.test(bodyLines[headerIdx].trim())) {
      addWrapped(
        [{ text: bodyLines[headerIdx].trim(), font: fontSpec(700, 12.5), color: palette.accent }],
        0,
        19,
        14,
      );
      headerIdx++;
      skipBlank();
    }

    layoutStandardLines(bodyLines.slice(headerIdx), true);

    // Sources block
    const parsedSources: { num: number; label: string; domain?: string }[] = [];
    let nextNum = 1;
    for (const rawLine of sourceLines) {
      const line = rawLine.trim();
      if (!line) continue;
      const numbered = line.match(/^\[(\d+)\]\s*(https?:\/\/\S+?)(?:\s+[—–-]\s*(.+))?$/);
      if (numbered) {
        const num = parseInt(numbered[1], 10);
        const url = numbered[2];
        const title = numbered[3]?.trim();
        parsedSources.push({ num, label: title || getDisplayUrl(url), domain: title ? getDomain(url) : undefined });
        nextNum = num + 1;
        continue;
      }
      const bare = line.match(/^(https?:\/\/\S+?)(?:\s+[—–-]\s*(.+))?$/);
      if (bare) {
        const url = bare[1];
        const title = bare[2]?.trim();
        parsedSources.push({ num: nextNum++, label: title || getDisplayUrl(url), domain: title ? getDomain(url) : undefined });
      }
    }

    if (parsedSources.length > 0) {
      y += 6;
      ops.push({ type: 'rule', x: CONTENT_X, y, x2: CONTENT_X + CONTENT_W, color: palette.ruleColor });
      y += 22;
      ops.push({
        type: 'line',
        x: CONTENT_X,
        y,
        runs: [{ text: 'SOURCES', font: fontSpec(800, 10.5), color: palette.mutedText }],
      });
      y += 18;

      for (const src of parsedSources) {
        const runs: StyledRun[] = [
          { text: `${src.num}. `, font: fontSpec(600, 12), color: palette.subtleText },
          { text: src.label, font: fontSpec(500, 12), color: palette.linkText },
        ];
        if (src.domain) {
          runs.push({ text: ` · ${src.domain}`, font: fontSpec(400, 11.5), color: palette.subtleText });
        }
        addWrapped(runs, 0, 18, 4);
      }
    }
  } else {
    layoutStandardLines(allLines, false);
  }

  // ── Bottom Watermark Footer ──
  y += 12;
  ops.push({
    type: 'rule',
    x: CONTENT_X,
    y,
    x2: CONTENT_X + CONTENT_W,
    color: palette.ruleColor,
  });
  y += 28;

  ops.push({
    type: 'line',
    x: CONTENT_X,
    y,
    runs: [
      { text: 'CITADEL WIRE', font: fontSpec(900, 13), color: palette.text },
      { text: '  ·  high signal news', font: fontSpec(500, 12), color: palette.mutedText },
    ],
  });

  const bottomUrl = 'citadelwire.com';
  mctx.font = fontSpec(800, 13);
  const bottomUrlW = mctx.measureText(bottomUrl).width;
  ops.push({
    type: 'line',
    x: CONTENT_X + CONTENT_W - bottomUrlW,
    y,
    runs: [{ text: bottomUrl, font: fontSpec(800, 13), color: palette.accent }],
  });

  const CARD_H = y - OUTER_PAD + 26;
  const TOTAL_HEIGHT = CARD_H + OUTER_PAD * 2;

  // Render at 2x DPR for crisp Retina social sharing (cap scale if an unusually long post exceeds canvas limits)
  const scale = TOTAL_HEIGHT > 7000 ? 1 : 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(WIDTH * scale);
  canvas.height = Math.ceil(TOTAL_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.scale(scale, scale);

  // Outer canvas background
  ctx.fillStyle = palette.outerBg;
  ctx.fillRect(0, 0, WIDTH, TOTAL_HEIGHT);

  // Card background + border
  drawRoundedRect(ctx, CARD_X, OUTER_PAD, CARD_W, CARD_H, 18);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top accent bar clipped cleanly inside card corners
  ctx.save();
  drawRoundedRect(ctx, CARD_X, OUTER_PAD, CARD_W, CARD_H, 18);
  ctx.clip();
  ctx.fillStyle = palette.accent;
  ctx.fillRect(CARD_X, OUTER_PAD, CARD_W, 3);
  ctx.restore();

  // Execute draw ops
  for (const op of ops) {
    if (op.type === 'rule') {
      ctx.strokeStyle = op.color ?? palette.ruleColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(op.x, op.y);
      ctx.lineTo(op.x2 ?? op.x, op.y);
      ctx.stroke();
    } else if (op.type === 'pill') {
      drawRoundedRect(ctx, op.x, op.y, op.x2 ?? 80, op.height ?? 22, 999);
      ctx.fillStyle = op.bg ?? palette.badgeBg;
      ctx.fill();
      ctx.font = op.font ?? fontSpec(800, 11);
      ctx.fillStyle = op.color ?? palette.badgeText;
      ctx.fillText(op.text ?? '', op.x + 10, op.y + 15);
    } else if (op.type === 'bullet') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = op.color ?? palette.accent;
      ctx.fill();
    } else if (op.type === 'subdash') {
      ctx.font = fontSpec(600, 14);
      ctx.fillStyle = op.color ?? palette.subtleText;
      ctx.fillText('–', op.x, op.y);
    } else if (op.type === 'accent') {
      ctx.fillStyle = op.color ?? palette.ruleColor;
      ctx.fillRect(op.x, op.y, 2.5, op.height ?? 20);
    } else if (op.type === 'line' && op.runs) {
      let curX = op.x;
      for (const run of op.runs) {
        ctx.font = run.font;
        ctx.fillStyle = run.color;
        ctx.fillText(run.text, curX, op.y);
        curX += ctx.measureText(run.text).width;
      }
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode screenshot PNG'));
    }, 'image/png');
  });
}

/** Generate and download a watermarked PNG screenshot of a wire post. */
export async function downloadPostScreenshot(
  event: NostrEvent,
  postType: PostType,
): Promise<string> {
  const blob = await renderPostScreenshotPng(event, postType);
  const slug = getPostUtcSlug(event);
  const filename = `citadelwire-${slug}.png`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return filename;
}
