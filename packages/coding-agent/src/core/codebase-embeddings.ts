/**
 * codebase-embeddings.ts — Lazy-loaded embedding pipeline for semantic codebase search.
 *
 * Uses @xenova/transformers with all-MiniLM-L6-v2 (384-dim, ~25MB model).
 * Model is downloaded on first use and cached at ~/.pi/models/.
 *
 * This module is lazy-loadable — the ONNX model is NOT loaded at startup.
 * It only loads when the first semantic search is performed.
 */

import type { SearchResult } from "./codebase-indexer.ts";

// ---------------------------------------------------------------------------
// Lazy pipeline
// ---------------------------------------------------------------------------

type FeatureExtractionFn = (
	text: string,
	options: {
		pooling?: "mean" | "cls";
		normalize?: boolean;
	},
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractPipeline: FeatureExtractionFn | null = null;
let pipelineModule: any = null;

async function getPipeline(): Promise<FeatureExtractionFn> {
	if (extractPipeline) return extractPipeline;

	try {
		// Dynamic import to keep module lazy
		pipelineModule = await import("@xenova/transformers");
		const pipeline = pipelineModule.pipeline ?? (pipelineModule.default as any)?.pipeline;
		if (!pipeline) {
			throw new Error("transformers pipeline not found");
		}
		extractPipeline = (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
			quantized: true,
		})) as FeatureExtractionFn;
		return extractPipeline;
	} catch (e: any) {
		throw new Error(
			`Failed to load embedding model: ${e?.message ?? e}. ` +
				"Model will be downloaded once and cached at ~/.cache/huggingface/.",
		);
	}
}

/** Check if the embedding model is available (already downloaded + loaded). */
export function isEmbeddingModelReady(): boolean {
	return extractPipeline !== null;
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

const EMBEDDING_DIM = 384;

/** Embed a single text string. Returns 384-dim normalized vector. */
export async function embed(text: string): Promise<Float32Array> {
	const pipe = await getPipeline();
	const result = await pipe(text, { pooling: "mean", normalize: true });
	// result.data is Float32Array, already normalized
	return result.data as Float32Array;
}

/** Normalized cosine similarity between two vectors. Returns 0..1. */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	const len = Math.min(a.length, b.length, EMBEDDING_DIM);
	for (let i = 0; i < len; i++) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		dot += ai * bi;
		na += ai * ai;
		nb += bi * bi;
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---------------------------------------------------------------------------
// Semantic reranking
// ---------------------------------------------------------------------------

/**
 * Re-rank rg search results by cosine similarity between the query and each
 * result's content line. Returns a new array sorted by semantic relevance.
 *
 * @param query  — Original user query
 * @param results — Raw rg results to rerank
 * @param topK  — Max results to return after reranking (default: same as input)
 */
export async function rerankBySimilarity(
	query: string,
	results: SearchResult[],
	topK?: number,
): Promise<SearchResult[]> {
	if (results.length === 0) return results;

	const queryVec = await embed(query);
	const k = topK ?? results.length;

	// Compute similarity for each result
	const scored = new Array<{ score: number; result: SearchResult }>(results.length);
	for (let i = 0; i < results.length; i++) {
		const lineText = results[i]!.lineContent;
		const lineVec = await embed(lineText);
		scored[i] = { score: cosineSimilarity(queryVec, lineVec), result: results[i]! };
	}

	// Sort by score descending
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, k).map((s) => s.result);
}

/**
 * Get the current status of the embedding pipeline.
 */
export function getEmbeddingStatus(): { ready: boolean; model: string; dim: number } {
	return {
		ready: isEmbeddingModelReady(),
		model: "Xenova/all-MiniLM-L6-v2",
		dim: EMBEDDING_DIM,
	};
}
