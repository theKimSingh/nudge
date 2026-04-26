import { useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { signInAnonymously, signOut, useSession } from "@/src/backend/session";
import { isSupabaseConfigured, supabase } from "@/src/backend/supabase";

export default function SupabaseSmokeTest() {
  const { session, loading } = useSession();
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setMessage("");
    const { data, error } = await signInAnonymously();
    if (error) setMessage(`Error: ${error.message}`);
    else setMessage(`Signed in as ${data.user?.id ?? "(no user)"}`);
    setBusy(false);
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage("");
    const { error } = await signOut();
    setMessage(error ? `Error: ${error.message}` : "Signed out.");
    setBusy(false);
  }

  async function handleRefresh() {
    setBusy(true);
    const { data, error } = await supabase.auth.getSession();
    setMessage(
      error
        ? `Error: ${error.message}`
        : data.session
          ? `Active session for ${data.session.user.id}`
          : "No active session.",
    );
    setBusy(false);
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">Supabase</ThemedText>

        <Section label="Configured">
          <ThemedText>{isSupabaseConfigured ? "yes" : "no — fill in .env"}</ThemedText>
        </Section>

        <Section label="Session">
          <ThemedText>
            {loading
              ? "loading…"
              : session
                ? `signed in as ${session.user.id}`
                : "signed out"}
          </ThemedText>
        </Section>

        {message ? (
          <Section label="Last result">
            <ThemedText>{message}</ThemedText>
          </Section>
        ) : null}

        <Button label="Sign in anonymously" onPress={handleSignIn} disabled={busy} />
        <Button label="Sign out" onPress={handleSignOut} disabled={busy || !session} />
        <Button label="Refresh session" onPress={handleRefresh} disabled={busy} />
      </ScrollView>
    </ThemedView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="defaultSemiBold">{label}</ThemedText>
      {children}
    </ThemedView>
  );
}

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <ThemedText style={styles.buttonLabel} lightColor="#fff" darkColor="#fff">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 16 },
  section: { gap: 4 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontWeight: "600", fontSize: 16 },
});
