package dev.orbit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.UsageSummary
import dev.orbit.app.data.UsageTotals
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.FormerAgentAvatar
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.SkeletonBlock
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.max

/** Dollars as people read them: "$3.42", "<$0.01", "$1,240". */
internal fun formatCost(dollars: Double): String = when {
    dollars <= 0.0 -> "$0.00"
    dollars < 0.01 -> "<$0.01"
    dollars < 1000 -> String.format(Locale.US, "$%.2f", dollars)
    else -> "$" + NumberFormat.getIntegerInstance(Locale.US).format(dollars.toLong())
}

/** Token counts, compact: "842", "1.3K", "182K", "1.2M". */
internal fun formatTokens(tokens: Long): String {
    fun compact(value: Double, unit: String) = (if (value < 10) String.format(Locale.US, "%.1f", value).removeSuffix(".0") else value.toLong().toString()) + unit
    return when {
        tokens < 1_000 -> tokens.toString()
        tokens < 1_000_000 -> compact(tokens / 1_000.0, "K")
        else -> compact(tokens / 1_000_000.0, "M")
    }
}

/** The periods the screen can show. */
internal val UsagePeriods = listOf(7, 30, 90)

/**
 * What the crew has cost: one estimated total for the period, then each agent and room as a ranked bar
 * against the biggest. Bars compare cost when every row has a price, and tokens otherwise, so rows are
 * always measured the same way.
 */
@Composable
fun UsageScreen(usage: UsageSummary?, agents: List<Agent>, days: Int, onDays: (Int) -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Usage", onBack, scrolled = scrolled) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (period in UsagePeriods) Pill("$period days", onClick = { onDays(period) }, selected = period == days)
            }
            Spacer(Modifier.height(OrbitDimens.section))
            when {
                usage == null || usage.days != days -> Loading()
                usage.total.requests == 0 -> Text(
                    "Nothing yet in the last $days days. Spend shows up here as your agents reply.",
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )
                else -> Summary(usage, agents)
            }
        }
    }
}

@Composable
private fun Loading() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SkeletonBlock(120.dp, 14.dp, RoundedCornerShape(OrbitDimens.radiusS))
        SkeletonBlock(180.dp, 48.dp, RoundedCornerShape(OrbitDimens.radiusS))
        SkeletonBlock(240.dp, 14.dp, RoundedCornerShape(OrbitDimens.radiusS))
    }
}

@Composable
private fun Summary(usage: UsageSummary, agents: List<Agent>) {
    val c = Orbit.colors
    val total = usage.total
    val anyPriced = total.cost > 0
    Text(if (anyPriced) "Estimated spend" else "Tokens used", style = OrbitType.label, color = c.textSecondary)
    Text(if (anyPriced) formatCost(total.cost) else formatTokens(total.tokens), style = OrbitType.hero, color = c.text)
    Text(
        "${formatTokens(total.input + total.cacheRead + total.cacheWrite)} tokens in · ${formatTokens(total.output)} out" +
            if (total.searches > 0) " · ${total.searches} web ${if (total.searches == 1) "lookup" else "lookups"}" else "",
        style = OrbitType.bodyS,
        color = c.textTertiary,
    )

    val byId = agents.associateBy { it.id }
    Breakdown("By agent", usage.agents) { row ->
        AgentAvatar(byId[row.agentId]?.avatar ?: FormerAgentAvatar, size = 28.dp)
    }
    Breakdown("By room", usage.rooms, leading = null)

    Text(
        "Estimates from published token prices, not a bill. Web searches aren't included, and models without a known " +
            "price show tokens only. Your provider's console has the exact amount.",
        Modifier.padding(top = OrbitDimens.labelGap),
        style = OrbitType.bodyS,
        color = c.textTertiary,
    )
}

@Composable
private fun Breakdown(title: String, rows: List<UsageTotals>, leading: (@Composable (UsageTotals) -> Unit)?) {
    if (rows.isEmpty()) return
    val byCost = rows.all { it.priced } && rows.any { it.cost > 0 }
    val measure = { row: UsageTotals -> if (byCost) row.cost else row.tokens.toDouble() }
    val ranked = rows.sortedByDescending(measure)
    val most = max(ranked.maxOf(measure), 1e-9)
    SectionTitle(title, Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
    OrbitCard(Modifier.fillMaxWidth()) {
        Column {
            ranked.forEachIndexed { index, row ->
                if (index > 0) Hairline()
                ShareRow(row, (measure(row) / most).toFloat(), leading)
            }
        }
    }
}

/** A name, its figures, and a bar for its share of the biggest row. */
@Composable
private fun ShareRow(row: UsageTotals, share: Float, leading: (@Composable (UsageTotals) -> Unit)?) {
    val c = Orbit.colors
    val cost = if (row.priced || row.cost > 0) formatCost(row.cost) else null
    val tokens = "${formatTokens(row.tokens)} tokens"
    Column(
        Modifier
            .fillMaxWidth()
            .padding(OrbitDimens.rowPad)
            .clearAndSetSemantics { contentDescription = listOfNotNull(row.name, cost, tokens).joinToString(", ") },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) {
                leading(row)
                Spacer(Modifier.padding(start = 12.dp))
            }
            Text(row.name, Modifier.weight(1f), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Column(Modifier.padding(start = 12.dp), horizontalAlignment = Alignment.End) {
                Text(cost ?: tokens, style = OrbitType.titleS, color = c.text)
                if (cost != null) Text(tokens, style = OrbitType.caption, color = c.textTertiary)
            }
        }
        Spacer(Modifier.height(10.dp))
        // Thin, rounded, one neutral hue on a quieter track of the same surface.
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.surfaceHigh)) {
            if (share > 0f) Box(Modifier.fillMaxWidth(share.coerceIn(0.02f, 1f)).fillMaxHeight().clip(CircleShape).background(c.primary))
        }
    }
}
