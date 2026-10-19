from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graph.nodes.clarify import ask, clarify, needs_answer
from app.graph.nodes.compose import compose
from app.graph.nodes.execute import execute
from app.graph.nodes.generate import generate
from app.graph.nodes.guard import guard_node
from app.graph.nodes.repair import repair
from app.graph.nodes.retrieve import retrieve
from app.graph.nodes.select import select
from app.graph.state import AgentContext, AgentState

AgentGraph = CompiledStateGraph[AgentState, AgentContext, AgentState, AgentState]


def after_guard(state: AgentState) -> str:
    statuses = {c["status"] for c in state["candidates"]}
    if "pending_exec" in statuses:
        return "execute"
    return "repair" if "needs_repair" in statuses else "select"


def after_execute(state: AgentState) -> str:
    return "repair" if any(c["status"] == "needs_repair" for c in state["candidates"]) else "select"


def build_graph(checkpointer: BaseCheckpointSaver[str] | None) -> AgentGraph:
    g = StateGraph(AgentState, context_schema=AgentContext)
    g.add_node("retrieve", retrieve)
    g.add_node("clarify", clarify)
    g.add_node("ask", ask)
    g.add_node("generate", generate)
    g.add_node("guard", guard_node)
    g.add_node("execute", execute)
    g.add_node("repair", repair)
    g.add_node("select", select)
    g.add_node("compose", compose)

    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "clarify")
    g.add_conditional_edges(
        "clarify", lambda s: "ask" if needs_answer(s) else "generate", ["ask", "generate"]
    )
    g.add_edge("ask", "generate")
    g.add_edge("generate", "guard")
    g.add_conditional_edges("guard", after_guard, ["execute", "repair", "select"])
    g.add_conditional_edges("execute", after_execute, ["repair", "select"])
    g.add_edge("repair", "guard")
    g.add_conditional_edges(
        "select", lambda s: "compose" if s.get("chosen") is not None else END, ["compose", END]
    )
    g.add_edge("compose", END)
    return g.compile(checkpointer=checkpointer)
