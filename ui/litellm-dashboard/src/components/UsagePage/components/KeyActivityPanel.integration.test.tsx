import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { components } from "@/lib/http/schema";
import { type DailyActivityKeyPageResponse, type KeyActivityRow, type KeySpendActivityRow } from "../dailyActivityApi";
import type { ModelActivityData } from "../types";
import KeyActivityPanel from "./KeyActivityPanel";

let triggerIntersection: (() => void) | undefined;

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    triggerIntersection = () =>
      this.callback(
        [
          {
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            intersectionRatio: 1,
            isIntersecting: true,
            rootBounds: null,
            target,
            time: 0,
          },
        ],
        this,
      );
  }

  unobserve(): void {}

  disconnect(): void {
    triggerIntersection = undefined;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const metrics: components["schemas"]["SpendMetrics"] = {
  api_requests: 2,
  autorouter_savings_spend: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  completion_tokens: 3,
  compression_saved_tokens: 0,
  compression_savings_spend: 0,
  failed_requests: 0,
  flat_cost: 0,
  gateway_injected_caching_savings_spend: 0,
  prompt_caching_savings_spend: 0,
  prompt_tokens: 4,
  spend: 1.25,
  successful_requests: 2,
  timed_requests: 0,
  total_response_time_ms: 0,
  total_tokens: 7,
};

const pageRow = (apiKey: string): KeySpendActivityRow => ({
  api_key: apiKey,
  metrics: {
    api_requests: 2,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    completion_tokens: 3,
    failed_requests: 0,
    prompt_tokens: 4,
    spend: 1.25,
    successful_requests: 2,
    total_tokens: 7,
  },
  metadata: { key_alias: apiKey, team_id: null },
});

const searchRow = (apiKey: string, alias: string): KeyActivityRow => ({
  api_key: apiKey,
  metrics,
  metadata: { key_alias: alias, team_id: null },
});

const pageResponse = (apiKeys: KeySpendActivityRow[], total: number, offset = 0): DailyActivityKeyPageResponse => ({
  api_keys: apiKeys,
  total_api_keys: total,
  offset,
  limit: 50,
});

const summary: ModelActivityData = {
  label: "Overall Usage",
  total_requests: 200,
  total_successful_requests: 198,
  total_failed_requests: 2,
  total_cache_read_input_tokens: 0,
  total_cache_creation_input_tokens: 0,
  total_tokens: 700,
  prompt_tokens: 400,
  completion_tokens: 300,
  total_spend: 500,
  total_response_time_ms: 0,
  total_timed_requests: 0,
  top_models: [],
  daily_data: [
    {
      date: "2026-09-27",
      metrics: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
        api_requests: 2,
        spend: 1.25,
        successful_requests: 2,
        failed_requests: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  ],
};

const detail = (apiKey: string): ModelActivityData => ({
  label: apiKey,
  total_requests: 2,
  total_successful_requests: 2,
  total_failed_requests: 0,
  total_cache_read_input_tokens: 0,
  total_cache_creation_input_tokens: 0,
  total_tokens: 7,
  prompt_tokens: 4,
  completion_tokens: 3,
  total_spend: 1.25,
  total_response_time_ms: 0,
  total_timed_requests: 0,
  top_models: [
    { model: "gpt-4o-mini", spend: 1.25, requests: 2, successful_requests: 2, failed_requests: 0, tokens: 7 },
  ],
  daily_data: [
    {
      date: "2026-09-27",
      metrics: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
        api_requests: 2,
        spend: 1.25,
        successful_requests: 2,
        failed_requests: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        avg_response_time_ms: null,
      },
    },
  ],
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  triggerIntersection = undefined;
});

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
});

describe("KeyActivityPanel", () => {
  it("loads the first page, appends the next page, and keeps limit copy out of the UI", async () => {
    let resolveNextPage: (response: DailyActivityKeyPageResponse) => void = () => {};
    const nextPage = new Promise<DailyActivityKeyPageResponse>((resolve) => {
      resolveNextPage = resolve;
    });
    const firstPageRows = Array.from({ length: 50 }, (_, index) => pageRow(`key-${index}`));
    const fetchKeyPage = vi.fn((offset: number, _limit: number) =>
      offset === 0 ? Promise.resolve(pageResponse(firstPageRows, 52)) : nextPage,
    );

    render(
      <KeyActivityPanel
        summary={summary}
        fetchKeyPage={fetchKeyPage}
        fetchKeyDetail={vi.fn().mockResolvedValue(detail("unused"))}
        searchKeys={vi.fn().mockResolvedValue({ api_keys: [] })}
        teams={[]}
      />,
    );

    expect(await screen.findByRole("button", { name: /key-49/ })).toBeInTheDocument();
    expect(screen.getByText("52 keys")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(fetchKeyPage).toHaveBeenCalledWith(0, 50);
    expect(screen.queryByText(/limit|truncat|highest-spend|load top/i)).not.toBeInTheDocument();

    await act(async () => {
      triggerIntersection?.();
    });
    expect(fetchKeyPage).toHaveBeenCalledWith(50, 50);
    expect(screen.getByText("Loading more keys...")).toBeInTheDocument();

    await act(async () => {
      resolveNextPage(pageResponse([pageRow("key-50"), pageRow("key-51")], 52, 50));
      await nextPage;
    });
    expect(await screen.findByRole("button", { name: /key-51/ })).toBeInTheDocument();
    expect(screen.queryByText("Loading more keys...")).not.toBeInTheDocument();
  });

  it("fetches full detail on first expansion and renders charts with daily data", async () => {
    const fetchKeyPage = vi.fn().mockResolvedValue(pageResponse([pageRow("key-chart")], 1));
    let resolveDetail: (metrics: ModelActivityData) => void = () => {};
    const detailResponse = new Promise<ModelActivityData>((resolve) => {
      resolveDetail = resolve;
    });
    const fetchKeyDetail = vi.fn().mockReturnValue(detailResponse);
    render(
      <KeyActivityPanel
        summary={summary}
        fetchKeyPage={fetchKeyPage}
        fetchKeyDetail={fetchKeyDetail}
        searchKeys={vi.fn().mockResolvedValue({ api_keys: [] })}
        teams={[]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /key-chart/ }));

    expect(fetchKeyDetail).toHaveBeenCalledWith("key-chart");
    expect(await screen.findByText("Loading key details...")).toBeInTheDocument();
    await act(async () => {
      resolveDetail(detail("key-chart"));
      await detailResponse;
    });
    expect(await screen.findByText("Spend per day")).toBeInTheDocument();
    expect(screen.getByText("Requests per day")).toBeInTheDocument();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("loads details for remote search results and merges local matches", async () => {
    vi.useFakeTimers();
    const fetchKeyPage = vi.fn().mockResolvedValue(pageResponse([pageRow("key-local-remote")], 2));
    const fetchKeyDetail = vi.fn().mockResolvedValue(detail("key-remote"));
    const searchKeys = vi.fn().mockResolvedValue({
      api_keys: [searchRow("key-remote", "remote server result")],
    });
    render(
      <KeyActivityPanel
        summary={summary}
        fetchKeyPage={fetchKeyPage}
        fetchKeyDetail={fetchKeyDetail}
        searchKeys={searchKeys}
        teams={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search keys"), { target: { value: "remote" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();
    expect(searchKeys).toHaveBeenCalledWith("remote");
    expect(screen.getByText("2 matching keys")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /key-local-remote/ })).toBeInTheDocument();
    const remoteButton = screen.getByRole("button", { name: /remote server result/ });
    fireEvent.click(remoteButton);

    expect(fetchKeyDetail).toHaveBeenCalledWith("key-remote");
    expect(await screen.findByText("Spend per day")).toBeInTheDocument();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("discards stale pages and clears loaded keys when the scope changes", async () => {
    let resolveOldPage: (response: DailyActivityKeyPageResponse) => void = () => {};
    const oldPage = new Promise<DailyActivityKeyPageResponse>((resolve) => {
      resolveOldPage = resolve;
    });
    const firstScopeFetch = vi.fn().mockReturnValue(oldPage);
    const secondScopeFetch = vi.fn().mockResolvedValue(pageResponse([pageRow("new-scope-key")], 1));
    const props = {
      summary,
      fetchKeyDetail: vi.fn().mockResolvedValue(detail("new-scope-key")),
      searchKeys: vi.fn().mockResolvedValue({ api_keys: [] }),
      teams: [],
    };
    const { rerender } = render(<KeyActivityPanel {...props} fetchKeyPage={firstScopeFetch} />);
    rerender(<KeyActivityPanel {...props} fetchKeyPage={secondScopeFetch} />);

    expect(await screen.findByRole("button", { name: /new-scope-key/ })).toBeInTheDocument();
    await act(async () => {
      resolveOldPage(pageResponse([pageRow("old-scope-key")], 1));
      await oldPage;
    });
    expect(screen.queryByRole("button", { name: /old-scope-key/ })).not.toBeInTheDocument();
    expect(secondScopeFetch).toHaveBeenCalledWith(0, 50);
  });
});
