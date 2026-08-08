import { Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ListItem, Screen, StatTile } from "../components/ui";
import { createStyles, theme } from "../theme";
import { ExchangeRateSnapshot, NetWorthAccount, NetWorthOverview } from "../types";
import { buildMoneyDisplay } from "../utils/exchange";
import { formatMoney } from "../utils/format";
import { RegionalPreferences } from "../utils/regional";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react-native";

type NetWorthScreenProps = {
  overview: NetWorthOverview | null;
  exchangeRates: ExchangeRateSnapshot | null;
  regionalPreferences: RegionalPreferences;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (account: NetWorthAccount) => void;
  onDelete: (account: NetWorthAccount) => Promise<void>;
};

const formatSubtypeLabel = (subtype: string): string =>
  subtype
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

export const NetWorthScreen = ({
  overview,
  exchangeRates,
  regionalPreferences,
  refreshing,
  onRefresh,
  onBack,
  onAdd,
  onEdit,
  onDelete
}: NetWorthScreenProps) => {
  const accounts = overview?.accounts ?? [];
  const assets = accounts.filter((item) => item.accountType === "asset");
  const liabilities = accounts.filter((item) => item.accountType === "liability");
  const summary = overview?.summary ?? null;

  const renderSection = (title: string, icon: React.ReactNode, items: NetWorthAccount[]) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptySectionText}>Nothing added yet.</Text>
      ) : (
        <View style={styles.listContainer}>
          {items.map((item) => {
            const display = buildMoneyDisplay(item.balance, item.currency, regionalPreferences, exchangeRates);
            return (
              <ListItem
                key={item.id}
                useCard
                title={item.name}
                subtitle={formatSubtypeLabel(item.subtype)}
                trailing={
                  <View style={styles.amountContainer}>
                    <Text style={[styles.amount, item.accountType === "asset" ? styles.positive : styles.negative]}>
                      {display.primaryLabel}
                    </Text>
                    {display.secondaryLabel ? <Text style={styles.amountSecondaryLabel}>{display.secondaryLabel}</Text> : null}
                  </View>
                }
              >
                {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
                <View style={styles.actionRow}>
                  <Button label="Edit" variant="ghost" onPress={() => onEdit(item)} style={styles.smallAction} />
                  <Button
                    label={<Text style={{ color: theme.color.actionDanger, fontWeight: "700" }}>Remove</Text>}
                    variant="ghost"
                    onPress={() => void onDelete(item)}
                    style={styles.smallActionDanger}
                  />
                </View>
              </ListItem>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <AppHeader
        title="Net Worth"
        subtitle="What you own, minus what you owe."
        rightSlot={<Button label="Add Account" onPress={onAdd} style={{ minHeight: 40 }} />}
      />

      {summary ? (
        <View style={styles.statRow}>
          <StatTile
            label="ASSETS"
            value={formatMoney(summary.totalAssets, summary.currency, regionalPreferences)}
            tone="positive"
            icon={<TrendingUp size={16} color={theme.color.statusSuccess} />}
          />
          <StatTile
            label="LIABILITIES"
            value={formatMoney(summary.totalLiabilities, summary.currency, regionalPreferences)}
            tone="negative"
            icon={<TrendingDown size={16} color={theme.color.actionDanger} />}
          />
        </View>
      ) : null}

      {summary ? (
        <Card variant="glass" style={styles.netWorthCard}>
          <View style={styles.titleRow}>
            <Wallet size={18} color={theme.color.actionPrimary} />
            <Text style={styles.netWorthLabel}>NET WORTH</Text>
          </View>
          <Text style={[styles.netWorthValue, summary.netWorth >= 0 ? styles.positive : styles.negative]}>
            {formatMoney(summary.netWorth, summary.currency, regionalPreferences)}
          </Text>
        </Card>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts tracked yet"
          description="Add your bank accounts, cash, investments, loans, and cards to see your net worth."
        />
      ) : (
        <>
          {renderSection("ASSETS", <TrendingUp size={16} color={theme.color.textMuted} />, assets)}
          {renderSection("LIABILITIES", <TrendingDown size={16} color={theme.color.textMuted} />, liabilities)}
        </>
      )}

      <Button label="Back" variant="ghost" onPress={onBack} style={styles.backButton} />
    </Screen>
  );
};

const styles = createStyles(() => ({
  statRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md
  },
  netWorthCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.xs
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs
  },
  netWorthLabel: {
    color: theme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2
  },
  netWorthValue: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1
  },
  section: {
    marginBottom: theme.spacing.lg
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs
  },
  sectionTitle: {
    color: theme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2
  },
  emptySectionText: {
    color: theme.color.textMuted,
    fontSize: theme.typography.caption,
    paddingHorizontal: theme.spacing.xs
  },
  listContainer: {
    gap: theme.spacing.md
  },
  amountContainer: {
    alignItems: "flex-end"
  },
  amount: {
    fontSize: theme.typography.heading,
    fontWeight: "900",
    letterSpacing: -0.5
  },
  amountSecondaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.textMuted,
    letterSpacing: 0.4
  },
  positive: {
    color: theme.color.statusSuccess
  },
  negative: {
    color: theme.color.actionDanger
  },
  notes: {
    color: theme.color.textSecondary,
    fontSize: theme.typography.caption,
    marginTop: theme.spacing.xs
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.borderSubtle,
    paddingTop: theme.spacing.sm
  },
  smallAction: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: theme.color.borderSubtle
  },
  smallActionDanger: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: theme.color.actionDanger,
    backgroundColor: "transparent"
  },
  backButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl
  }
}));
