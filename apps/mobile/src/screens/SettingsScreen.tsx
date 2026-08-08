import { useEffect, useRef, useState } from "react";
import { Alert, Switch, Text, View, Image } from "react-native";
import { APP_BUILD_LABEL } from "../appMetadata";
import { AppHeader, Button, Card, InlineMessage, publishToast, Screen, SelectField } from "../components/ui";
import { createStyles, theme } from "../theme";
import { ShieldAlert, ShieldCheck, LogOut, TerminalSquare, FolderTree, User, SlidersHorizontal, Wallet } from "lucide-react-native";
import { UserProfile } from "../types";
import { currencyOptions } from "../utils/regionalOptions";

type SettingsScreenProps = {
  profile: UserProfile | null;
  displayCurrency: string;
  smsDisclosureVersion: string;
  onOpenProfile: () => void;
  onRequestEnable: (enabled: boolean) => Promise<void>;
  onOpenCategoryManager: () => void;
  onOpenNetWorth: () => void;
  onSaveProfileSettings: (settings: UserProfile["settings"]) => Promise<void>;
  onChangeDisplayCurrency: (currency: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export const SettingsScreen = ({
  profile,
  displayCurrency,
  smsDisclosureVersion,
  onOpenProfile,
  onRequestEnable,
  onOpenCategoryManager,
  onOpenNetWorth,
  onSaveProfileSettings,
  onChangeDisplayCurrency,
  onDeleteAccount,
  onSignOut
}: SettingsScreenProps) => {
  const resolvedProfileName =
    profile?.displayName?.trim() ||
    [profile?.firstName?.trim(), profile?.lastName?.trim()].filter(Boolean).join(" ") ||
    profile?.email ||
    "Profile";

  const [settingsState, setSettingsState] = useState<UserProfile["settings"]>(
    profile?.settings ?? {
      pushNotificationsEnabled: true,
      emailNotificationsEnabled: true,
      weeklySummaryEnabled: true,
      biometricsEnabled: false,
      marketingOptIn: false
    }
  );
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [displayCurrencyState, setDisplayCurrencyState] = useState(displayCurrency);
  const requestVersionRef = useRef(0);
  const currencyRequestVersionRef = useRef(0);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setSettingsState(profile.settings);
  }, [profile]);

  useEffect(() => {
    setDisplayCurrencyState(displayCurrency);
  }, [displayCurrency]);

  const updatePreference = async (patch: Partial<UserProfile["settings"]>) => {
    if (!profile) {
      return;
    }

    const nextSettings: UserProfile["settings"] = {
      ...settingsState,
      ...patch
    };
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const [updatedKey] = Object.keys(patch) as (keyof UserProfile["settings"])[];

    const preferenceLabelMap: Record<keyof UserProfile["settings"], string> = {
      pushNotificationsEnabled: "Push notifications",
      emailNotificationsEnabled: "Email notifications",
      weeklySummaryEnabled: "Weekly summary",
      biometricsEnabled: "Biometric lock",
      marketingOptIn: "Product updates"
    };
    const preferenceLabel = updatedKey ? preferenceLabelMap[updatedKey] : "Preference";
    const preferenceState = updatedKey && nextSettings[updatedKey] ? "enabled" : "disabled";

    setSettingsState(nextSettings);
    setSavingPreferences(true);

    try {
      await onSaveProfileSettings(nextSettings);
      if (requestVersionRef.current === requestVersion) {
        publishToast({
          tone: "success",
          title: "Preferences",
          message: `${preferenceLabel} ${preferenceState}.`
        });
      }
    } catch (error) {
      if (requestVersionRef.current === requestVersion) {
        setSettingsState(profile.settings);
        publishToast({
          tone: "error",
          title: "Preferences",
          message: error instanceof Error ? error.message : "Unable to update preferences right now."
        });
      }
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setSavingPreferences(false);
      }
    }
  };

  const handleSmsIntentAction = async (enabled: boolean) => {
    try {
      await onRequestEnable(enabled);
    } catch (error) {
      publishToast({
        tone: "error",
        title: "SMS protocol",
        message: error instanceof Error ? error.message : "Unable to record this request right now."
      });
    }
  };

  const handleSelectDisplayCurrency = async (currency: string) => {
    if (!profile || currency === displayCurrencyState) {
      return;
    }

    const previousCurrency = displayCurrencyState;
    const requestVersion = currencyRequestVersionRef.current + 1;
    currencyRequestVersionRef.current = requestVersion;

    setDisplayCurrencyState(currency);
    setSavingCurrency(true);

    try {
      await onChangeDisplayCurrency(currency);
      if (currencyRequestVersionRef.current === requestVersion) {
        publishToast({
          tone: "success",
          title: "Display currency",
          message: `All portfolio values now render in ${currency}.`
        });
      }
    } catch (error) {
      if (currencyRequestVersionRef.current === requestVersion) {
        setDisplayCurrencyState(previousCurrency);
        publishToast({
          tone: "error",
          title: "Display currency",
          message: error instanceof Error ? error.message : "Unable to switch display currency right now."
        });
      }
    } finally {
      if (currencyRequestVersionRef.current === requestVersion) {
        setSavingCurrency(false);
      }
    }
  };

  const handleSignOutTap = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to log out of your session?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            try {
              await onSignOut();
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Sign out",
                message: error instanceof Error ? error.message : "Unable to sign out right now."
              });
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccountTap = async () => {
    try {
      await onDeleteAccount();
    } catch (error) {
      publishToast({
        tone: "error",
        title: "Delete account",
        message: error instanceof Error ? error.message : "Unable to delete account right now."
      });
    }
  };

  return (
    <Screen>
      <AppHeader title="Settings" subtitle="Security and configuration." />

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <User size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>PROFILE</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Manage identity and regional profile details.</Text>
        </View>
        <View style={styles.profileSummary}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.profileAvatar} />
          ) : (
            <View style={styles.profileAvatar}>
              <User size={24} color={theme.color.textMuted} />
            </View>
          )}
          <View style={styles.profileTextContainer}>
            <Text style={styles.profileName}>{resolvedProfileName}</Text>
            <Text style={styles.profileEmail}>{profile?.email ?? "Loading profile..."}</Text>
          </View>
        </View>
        <Button label="EDIT PROFILE" variant="secondary" onPress={onOpenProfile} />
      </Card>

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <TerminalSquare size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>DATA EXTRACTION</Text>
          </View>
          <Text style={styles.sectionSubtitle}>SMS Parsing Protocol</Text>
        </View>
        
        <InlineMessage 
          tone="warn" 
          text="Extraction protocol offline. Intent logging only for current build." 
        />
        
        <View style={styles.disclosureInfo}>
          <Text style={styles.disclosureText}>POLICY VER: {smsDisclosureVersion.toUpperCase()}</Text>
        </View>

        <View style={styles.actionRow}>
          <Button 
            label={
              <>
                <ShieldCheck size={16} color={theme.color.textPrimary} />
                <Text style={{color: theme.color.textPrimary, fontWeight: '700'}}>MAINTAIN OFFLINE</Text>
              </>
            } 
            variant="ghost" 
            onPress={() => void handleSmsIntentAction(false)} 
            style={styles.flexAction} 
          />
          <Button 
            label={
              <>
                <ShieldAlert size={16} color={theme.color.textInverse} />
                <Text style={{color: theme.color.textInverse, fontWeight: '800'}}>AUTHORIZE</Text>
              </>
            } 
            variant="primary" 
            onPress={() => void handleSmsIntentAction(true)} 
            style={styles.flexAction} 
          />
        </View>
      </Card>

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <FolderTree size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>CATEGORY STUDIO</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Create and maintain your custom categories.</Text>
        </View>
        <Button label="MANAGE CATEGORIES" variant="secondary" onPress={onOpenCategoryManager} />
      </Card>

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <Wallet size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>NET WORTH</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Track assets, liabilities, and what you're really worth.</Text>
        </View>
        <Button label="VIEW NET WORTH" variant="secondary" onPress={onOpenNetWorth} />
      </Card>

      <Card variant="glass" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <SlidersHorizontal size={18} color={theme.color.textMuted} />
            <Text style={styles.sectionTitle}>PREFERENCES</Text>
          </View>
          <Text style={styles.sectionSubtitle}>App behavior controls for this account.</Text>
        </View>

        <SelectField
          label="DISPLAY CURRENCY"
          value={displayCurrencyState}
          options={currencyOptions}
          searchable
          placeholder="Select display currency"
          onSelect={(value) => {
            void handleSelectDisplayCurrency(value);
          }}
        />
        <Text style={styles.preferenceNote}>
          Dashboard, ledger, budgets, and goals render in the selected display currency while each record keeps its original stored currency.
        </Text>
        {savingCurrency ? <Text style={styles.preferenceSavingLabel}>Updating display currency...</Text> : null}

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Push Notifications</Text>
            <Text style={styles.toggleSubtitle}>Transaction and reminder alerts.</Text>
          </View>
          <Switch
            value={settingsState.pushNotificationsEnabled}
            disabled={savingPreferences || !profile}
            onValueChange={(value) => {
              void updatePreference({ pushNotificationsEnabled: value });
            }}
            trackColor={{ false: theme.color.borderStrong, true: theme.color.actionPrimary }}
            thumbColor={theme.color.surface}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Email Notifications</Text>
            <Text style={styles.toggleSubtitle}>Security and account activity emails.</Text>
          </View>
          <Switch
            value={settingsState.emailNotificationsEnabled}
            disabled={savingPreferences || !profile}
            onValueChange={(value) => {
              void updatePreference({ emailNotificationsEnabled: value });
            }}
            trackColor={{ false: theme.color.borderStrong, true: theme.color.actionPrimary }}
            thumbColor={theme.color.surface}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Weekly Summary</Text>
            <Text style={styles.toggleSubtitle}>Weekly spending digest and trends.</Text>
          </View>
          <Switch
            value={settingsState.weeklySummaryEnabled}
            disabled={savingPreferences || !profile}
            onValueChange={(value) => {
              void updatePreference({ weeklySummaryEnabled: value });
            }}
            trackColor={{ false: theme.color.borderStrong, true: theme.color.actionPrimary }}
            thumbColor={theme.color.surface}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Biometric Lock</Text>
            <Text style={styles.toggleSubtitle}>Require biometric unlock on this device.</Text>
          </View>
          <Switch
            value={settingsState.biometricsEnabled}
            disabled={savingPreferences || !profile}
            onValueChange={(value) => {
              void updatePreference({ biometricsEnabled: value });
            }}
            trackColor={{ false: theme.color.borderStrong, true: theme.color.actionPrimary }}
            thumbColor={theme.color.surface}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Product Updates</Text>
            <Text style={styles.toggleSubtitle}>Feature announcements and release notes.</Text>
          </View>
          <Switch
            value={settingsState.marketingOptIn}
            disabled={savingPreferences || !profile}
            onValueChange={(value) => {
              void updatePreference({ marketingOptIn: value });
            }}
            trackColor={{ false: theme.color.borderStrong, true: theme.color.actionPrimary }}
            thumbColor={theme.color.surface}
          />
        </View>
      </Card>

      <Card variant="muted" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <LogOut size={18} color={theme.color.textPrimary} />
            <Text style={styles.sectionTitle}>SIGN OUT</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Securely end your session on this device.</Text>
        </View>
        <Button 
          label="LOGOUT" 
          variant="secondary" 
          onPress={() => void handleSignOutTap()} 
          style={styles.signOutButton}
        />
      </Card>

      <Card variant="muted" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.color.statusError }]}>ACCOUNT DELETION</Text>
          <Text style={styles.sectionSubtitle}>Permanently remove account data from cloud storage.</Text>
        </View>
        <Button label="DELETE ACCOUNT" variant="danger" onPress={() => void handleDeleteAccountTap()} />
      </Card>

      <View style={styles.versionFooter}>
        <Text style={styles.versionText}>{APP_BUILD_LABEL}</Text>
      </View>
    </Screen>
  );
};

const styles = createStyles(() => ({
  sectionCard: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg
  },
  sectionHeader: {
    gap: 4
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs
  },
  sectionTitle: {
    color: theme.color.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2
  },
  sectionSubtitle: {
    color: theme.color.textSecondary,
    fontSize: theme.typography.body,
    fontWeight: "600",
    letterSpacing: -0.5
  },
  disclosureInfo: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.color.bgBase,
    borderWidth: 1,
    borderColor: theme.color.borderSubtle,
    borderRadius: theme.radius.sm,
    alignItems: "center"
  },
  disclosureText: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1
  },
  profileSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.color.borderSubtle,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceMuted
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.bgBase,
    borderWidth: 1,
    borderColor: theme.color.borderSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  profileTextContainer: {
    flex: 1,
    gap: 2,
    justifyContent: "center"
  },
  profileName: {
    color: theme.color.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: "700"
  },
  profileEmail: {
    color: theme.color.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: "600"
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.borderSubtle
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2
  },
  toggleTitle: {
    color: theme.color.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: "600"
  },
  toggleSubtitle: {
    color: theme.color.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: "500"
  },
  preferenceNote: {
    color: theme.color.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 18,
    marginTop: -theme.spacing.xs
  },
  preferenceSavingLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: -theme.spacing.xs
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs
  },
  flexAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row"
  },
  signOutButton: {
    marginTop: theme.spacing.sm,
    minHeight: 52
  },
  versionFooter: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
    opacity: 0.5
  },
  versionText: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2
  }
}));
