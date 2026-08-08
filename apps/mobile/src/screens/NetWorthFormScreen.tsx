import { useState } from "react";
import { Text, View } from "react-native";
import { AppHeader, Button, Card, publishToast, Screen, TextField } from "../components/ui";
import { createStyles, theme } from "../theme";
import { NetWorthAccount, NetWorthAccountType } from "../types";
import { Check, Landmark, TrendingDown, TrendingUp, Wallet, X } from "lucide-react-native";

type NetWorthFormSubmit = {
  name: string;
  accountType: NetWorthAccountType;
  subtype: string;
  balance: number;
  currency: string;
  notes: string | null;
};

type NetWorthFormScreenProps = {
  initial?: NetWorthAccount | null;
  defaultCurrency: string;
  onCancel: () => void;
  onSubmit: (payload: NetWorthFormSubmit) => Promise<void>;
};

const assetSubtypes = ["bank", "cash", "investment", "property", "vehicle", "other_asset"];
const liabilitySubtypes = ["credit_card", "loan", "other_liability"];

const formatSubtypeLabel = (subtype: string): string =>
  subtype
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

export const NetWorthFormScreen = ({ initial, defaultCurrency, onCancel, onSubmit }: NetWorthFormScreenProps) => {
  const [accountType, setAccountType] = useState<NetWorthAccountType>(initial?.accountType ?? "asset");
  const [name, setName] = useState(initial?.name ?? "");
  const [subtype, setSubtype] = useState(initial?.subtype ?? assetSubtypes[0]);
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);

  const resolveMessage = (input: unknown, fallback: string): string =>
    input instanceof Error && input.message.trim().length > 0 ? input.message : fallback;

  const availableSubtypes = accountType === "asset" ? assetSubtypes : liabilitySubtypes;

  const handleChangeAccountType = (nextType: NetWorthAccountType) => {
    setAccountType(nextType);
    const nextSubtypes = nextType === "asset" ? assetSubtypes : liabilitySubtypes;
    if (!nextSubtypes.includes(subtype)) {
      setSubtype(nextSubtypes[0]);
    }
  };

  const handleSubmit = async () => {
    if (name.trim().length < 2) {
      publishToast({
        tone: "error",
        title: "Net Worth",
        message: "Enter a valid account name."
      });
      return;
    }

    const parsedBalance = Number(balance);
    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      publishToast({
        tone: "error",
        title: "Net Worth",
        message: "Enter a valid balance (0 or greater)."
      });
      return;
    }

    setLoading(true);

    try {
      await onSubmit({
        name: name.trim(),
        accountType,
        subtype,
        balance: parsedBalance,
        currency: currency.toUpperCase(),
        notes: notes.trim().length > 0 ? notes.trim() : null
      });
    } catch (submitError) {
      publishToast({
        tone: "error",
        title: "Net Worth",
        message: resolveMessage(submitError, "Unable to save this account right now.")
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboardAware>
      <AppHeader
        title={initial ? "Edit Account" : "Add Account"}
        subtitle="Track what you own or owe."
      />

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <Landmark size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>ACCOUNT TYPE</Text>
          </View>
        </View>
        <View style={styles.typeRow}>
          <Button
            label={
              <>
                <TrendingUp size={18} color={accountType === "asset" ? theme.color.textInverse : theme.color.textPrimary} />
                <Text style={{ color: accountType === "asset" ? theme.color.textInverse : theme.color.textPrimary, fontWeight: "800" }}>
                  ASSET
                </Text>
              </>
            }
            variant={accountType === "asset" ? "primary" : "ghost"}
            onPress={() => handleChangeAccountType("asset")}
            style={styles.typeButton}
          />
          <Button
            label={
              <>
                <TrendingDown size={18} color={accountType === "liability" ? theme.color.textInverse : theme.color.textPrimary} />
                <Text style={{ color: accountType === "liability" ? theme.color.textInverse : theme.color.textPrimary, fontWeight: "800" }}>
                  LIABILITY
                </Text>
              </>
            }
            variant={accountType === "liability" ? "danger" : "ghost"}
            onPress={() => handleChangeAccountType("liability")}
            style={styles.typeButton}
          />
        </View>

        <Text style={styles.subLabel}>CATEGORY</Text>
        <View style={styles.subtypeRow}>
          {availableSubtypes.map((option) => (
            <Button
              key={option}
              label={<Text style={{ color: subtype === option ? theme.color.textInverse : theme.color.textPrimary, fontSize: 12, fontWeight: "700" }}>{formatSubtypeLabel(option)}</Text>}
              variant={subtype === option ? "primary" : "ghost"}
              onPress={() => setSubtype(option)}
              style={styles.subtypeButton}
            />
          ))}
        </View>
      </Card>

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <Wallet size={18} color={theme.color.actionPrimary} />
            <Text style={styles.sectionTitle}>BALANCE</Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <TextField
            label={accountType === "asset" ? "CURRENT VALUE" : "AMOUNT OWED"}
            value={balance}
            onChangeText={setBalance}
            keyboardType="decimal-pad"
            placeholder="0.00"
            containerStyle={styles.amountField}
            style={styles.amountInput}
          />
          <TextField
            label="CUR"
            value={currency}
            onChangeText={setCurrency}
            autoCapitalize="characters"
            maxLength={3}
            containerStyle={styles.currencyField}
            style={styles.currencyInput}
          />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DETAILS</Text>
        </View>

        <TextField label="ACCOUNT NAME" value={name} onChangeText={setName} placeholder="e.g. HDFC Savings" />
        <TextField
          label="NOTES (OPTIONAL)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any extra context"
          multiline
          numberOfLines={2}
        />
      </Card>

      <View style={styles.actionRow}>
        <Button
          label={
            <>
              <X size={20} color={theme.color.textPrimary} />
              <Text style={{ color: theme.color.textPrimary, fontWeight: "700" }}>DISCARD</Text>
            </>
          }
          variant="ghost"
          onPress={onCancel}
          style={styles.flexAction}
        />
        <Button
          label={
            <>
              <Check size={20} color={theme.color.textInverse} />
              <Text style={{ color: theme.color.textInverse, fontWeight: "800" }}>SAVE</Text>
            </>
          }
          variant="primary"
          onPress={() => void handleSubmit()}
          loading={loading}
          style={styles.flexAction}
        />
      </View>
    </Screen>
  );
};

const styles = createStyles(() => ({
  sectionCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md
  },
  sectionHeader: {
    marginBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.borderSubtle,
    paddingBottom: theme.spacing.sm
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs
  },
  sectionTitle: {
    color: theme.color.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2
  },
  typeRow: {
    flexDirection: "row",
    gap: theme.spacing.md
  },
  typeButton: {
    flex: 1,
    minHeight: 52
  },
  subLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: theme.spacing.sm
  },
  subtypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  subtypeButton: {
    minHeight: 36,
    paddingVertical: 0,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.color.surfaceMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.borderSubtle
  },
  amountRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "flex-end"
  },
  amountField: {
    flex: 3,
    marginBottom: 0
  },
  currencyField: {
    flex: 1,
    marginBottom: 0
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.5,
    minHeight: 64
  },
  currencyInput: {
    textAlign: "center",
    fontWeight: "800",
    letterSpacing: 2,
    minHeight: 64
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl
  },
  flexAction: {
    flex: 1,
    minHeight: 56
  }
}));
