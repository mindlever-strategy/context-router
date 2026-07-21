"""Type definitions for Context Router Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal, Optional


class WorkflowStatus(str, Enum):
    """Workflow execution status."""

    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass
class Workspace:
    """Represents a Context Router workspace."""

    id: str
    name: str
    owner_id: str
    created_at: str


@dataclass
class Workflow:
    """Represents a Context Router workflow."""

    id: str
    workspace_id: str
    status: WorkflowStatus
    created_at: str
    completed_at: Optional[str] = None
    failure_reason: Optional[str] = None


@dataclass
class StateValue:
    """A key-value state entry."""

    key: str
    value: dict[str, Any]
    version: int


@dataclass
class HandoffPacket:
    """Structured handoff packet."""

    facts: dict[str, Any]
    decisions: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    next_goals: list[str] = field(default_factory=list)


@dataclass
class HandoffResult:
    """Result of a handoff generation."""

    summary: str
    keys_included: list[str]
    packet: Optional[HandoffPacket] = None


@dataclass
class Checkpoint:
    """A workflow checkpoint."""

    id: str
    workspace_id: str
    workflow_id: str
    label: Optional[str]
    created_at: str


@dataclass
class RouterStatus:
    """Router installation and storage status."""

    version: str
    storage: dict[str, Any]
    totals: dict[str, int]
    recent_workflows: list[Workflow]


ProvenanceMode = Literal["per-field", "whole-object"]
HandoffFormat = Literal["text", "structured"]


def workspace_from_dict(data: dict[str, Any]) -> Workspace:
    return Workspace(
        id=data["id"],
        name=data["name"],
        owner_id=data["ownerId"],
        created_at=data["createdAt"],
    )


def workflow_from_dict(data: dict[str, Any]) -> Workflow:
    return Workflow(
        id=data["id"],
        workspace_id=data["workspaceId"],
        status=WorkflowStatus(data["status"]),
        created_at=data["createdAt"],
        completed_at=data.get("completedAt"),
        failure_reason=data.get("failureReason"),
    )


def state_value_from_dict(data: dict[str, Any]) -> StateValue:
    return StateValue(
        key=data["key"],
        value=data["value"],
        version=data["version"],
    )


def checkpoint_from_dict(data: dict[str, Any]) -> Checkpoint:
    return Checkpoint(
        id=data["id"],
        workspace_id=data["workspaceId"],
        workflow_id=data["workflowId"],
        label=data.get("label"),
        created_at=data["createdAt"],
    )


def handoff_result_from_dict(data: dict[str, Any]) -> HandoffResult:
    packet_data = data.get("packet")
    packet = None
    if packet_data:
        packet = HandoffPacket(
            facts=packet_data.get("facts", {}),
            decisions=packet_data.get("decisions", []),
            open_questions=packet_data.get("openQuestions", []),
            next_goals=packet_data.get("nextGoals", []),
        )
    return HandoffResult(
        summary=data["summary"],
        keys_included=data.get("keysIncluded", []),
        packet=packet,
    )


def router_status_from_dict(data: dict[str, Any]) -> RouterStatus:
    return RouterStatus(
        version=data["version"],
        storage=data["storage"],
        totals=data["totals"],
        recent_workflows=[workflow_from_dict(item) for item in data["recentWorkflows"]],
    )
