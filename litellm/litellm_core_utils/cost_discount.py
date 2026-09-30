import fnmatch
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Final

_GLOB_CHARS: Final = frozenset("*?[")


@dataclass(frozen=True, slots=True)
class CostDiscountKey:
    provider: str
    model_pattern: str | None


def parse_cost_discount_key(key: str) -> CostDiscountKey:
    provider, separator, pattern = key.partition("/")
    return CostDiscountKey(provider=provider, model_pattern=pattern if separator else None)


def _literal_length(pattern: str) -> int:
    length = 0
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char in "*?":
            index += 1
            continue
        if char == "[":
            search_start = index + 2 if pattern[index + 1 : index + 2] == "!" else index + 1
            if pattern[search_start : search_start + 1] == "]":
                search_start += 1
            closing = pattern.find("]", search_start)
            if closing >= 0:
                index = closing + 1
                continue
        length += 1
        index += 1
    return length


def _iter_model_names(model: str, provider_prefix: str) -> Iterator[str]:
    if not model.startswith(provider_prefix):
        yield model
        return
    stripped = model
    while stripped.startswith(provider_prefix):
        stripped = stripped[len(provider_prefix) :]
        yield stripped


def resolve_cost_discount(
    cost_discount_config: Mapping[str, float],
    custom_llm_provider: str | None,
    model: str | None,
) -> float | None:
    if not custom_llm_provider:
        return None

    provider_prefix: Final = f"{custom_llm_provider}/"
    model_names: Final = () if model is None else tuple(_iter_model_names(model, provider_prefix))
    patterns: Final = tuple(
        parsed.model_pattern
        for parsed in (parse_cost_discount_key(key) for key in cost_discount_config)
        if parsed.provider == custom_llm_provider and parsed.model_pattern is not None
    )

    exact_patterns: Final = frozenset(pattern for pattern in patterns if _GLOB_CHARS.isdisjoint(pattern))
    exact: Final = next((name for name in model_names if name in exact_patterns), None)
    if exact is not None:
        return cost_discount_config[f"{custom_llm_provider}/{exact}"]
    matches: Final = tuple(
        pattern
        for pattern in patterns
        if not _GLOB_CHARS.isdisjoint(pattern)
        and any(
            fnmatch.fnmatchcase(name, pattern)
            for name in model_names
            if "/" in pattern or not name.startswith(provider_prefix)
        )
    )
    if matches:
        best_match: Final = max(matches, key=_literal_length)
        return cost_discount_config[f"{custom_llm_provider}/{best_match}"]

    return cost_discount_config.get(custom_llm_provider)
