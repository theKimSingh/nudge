import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import {
  resendEmailOtp,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUpWithEmail,
  verifyEmailOtp,
} from '@/src/backend/onboarding-auth';
import { getProfile } from '@/src/backend/profiles';

import { BackButton } from '../components/back-button';
import { FadeSlideIn } from '../components/fade-slide-in';
import { NudgeWordmark } from '../components/nudge-wordmark';
import { AppleLogo, GoogleG } from '../components/oauth-icons';
import { useOnboarding } from '../context/onboarding-context';

type Mode = 'signup' | 'signin';
type Stage = 'form' | 'verify';
type LoadingProvider = null | 'apple' | 'google' | 'email';

const OTP_LENGTH = 6;

const isEmailValid = (email: string) => /@.+\./.test(email);
const isPasswordValid = (password: string) => password.length >= 8;

export function AuthScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { setPendingSession } = useOnboarding();

  const [mode, setMode] = useState<Mode>('signup');
  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState<LoadingProvider>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState(false);

  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (stage === 'verify') {
      const timer = setTimeout(() => otpInputRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  useEffect(() => {
    if (resendOk) {
      const timer = setTimeout(() => setResendOk(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [resendOk]);

  const canSubmitForm =
    isEmailValid(email) && (mode === 'signin' || isPasswordValid(password)) && !loading;
  const canSubmitVerify = code.length === OTP_LENGTH && !loading;

  async function handleEmailSubmit() {
    setError(null);
    setLoading('email');
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password);
        setStage('verify');
      } else {
        const session = await signInWithPassword(email, password);
        setPendingSession(session);
        const profile = await getProfile(session.userId);
        if (profile?.onboarded) {
          router.replace('/(tabs)/todo');
        } else {
          router.push('/(onboarding)/profile-setup');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(null);
    }
  }

  async function handleVerifySubmit() {
    setError(null);
    setLoading('email');
    try {
      const session = await verifyEmailOtp(email, code);
      setPendingSession(session);
      router.push('/(onboarding)/profile-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(null);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await resendEmailOtp(email);
      setResendOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend.');
    }
  }

  async function handleApple() {
    setError(null);
    setLoading('apple');
    try {
      const session = await signInWithApple();
      setPendingSession(session);
      router.push('/(onboarding)/profile-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed.');
    } finally {
      setLoading(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading('google');
    try {
      const session = await signInWithGoogle();
      setPendingSession(session);
      router.push('/(onboarding)/profile-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(null);
    }
  }

  function handleBack() {
    if (stage === 'verify') {
      setStage('form');
      setCode('');
      setError(null);
    } else if (router.canGoBack()) {
      router.back();
    }
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FadeSlideIn delay={0}>
              <View style={styles.topBar}>
                <BackButton onPress={handleBack} />
                <NudgeWordmark />
              </View>
            </FadeSlideIn>

            {stage === 'form' ? (
              <FormStage
                mode={mode}
                email={email}
                password={password}
                loading={loading}
                error={error}
                canSubmit={canSubmitForm}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onModeChange={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setError(null);
                }}
                onSubmit={handleEmailSubmit}
                onApple={handleApple}
                onGoogle={handleGoogle}
                palette={palette}
              />
            ) : (
              <VerifyStage
                email={email}
                code={code}
                loading={loading}
                error={error}
                resendOk={resendOk}
                canSubmit={canSubmitVerify}
                otpInputRef={otpInputRef}
                onCodeChange={(text) => setCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                onSubmit={handleVerifySubmit}
                onResend={handleResend}
                palette={palette}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

type Palette = (typeof Colors)['light'];

type FormStageProps = {
  mode: Mode;
  email: string;
  password: string;
  loading: LoadingProvider;
  error: string | null;
  canSubmit: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onModeChange: () => void;
  onSubmit: () => void;
  onApple: () => void;
  onGoogle: () => void;
  palette: Palette;
};

function FormStage(props: FormStageProps) {
  const {
    mode,
    email,
    password,
    loading,
    error,
    canSubmit,
    onEmailChange,
    onPasswordChange,
    onModeChange,
    onSubmit,
    onApple,
    onGoogle,
    palette,
  } = props;
  const isSignup = mode === 'signup';

  return (
    <View style={styles.formColumn}>
      <FadeSlideIn delay={0.1}>
        <ThemedText type="sen-large-title" style={styles.formHeadline}>
          {isSignup ? 'Sign up' : 'Sign in'}
        </ThemedText>
      </FadeSlideIn>

      <FadeSlideIn delay={0.15}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          accessibilityState={{ disabled: !!loading }}
          disabled={!!loading}
          onPress={onApple}
          style={({ pressed }) => [
            styles.oauthButton,
            {
              backgroundColor: palette.buttonFill,
              opacity: pressed && !loading ? 0.7 : 1,
            },
          ]}
        >
          {loading === 'apple' ? (
            <ActivityIndicator color={palette.buttonLabel} />
          ) : (
            <>
              <AppleLogo size={18} color={palette.buttonLabel} />
              <ThemedText
                type="sen-subheadline"
                lightColor={Colors.light.buttonLabel}
                darkColor={Colors.dark.buttonLabel}
              >
                Continue with Apple
              </ThemedText>
            </>
          )}
        </Pressable>
      </FadeSlideIn>

      <FadeSlideIn delay={0.18}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: !!loading }}
          disabled={!!loading}
          onPress={onGoogle}
          style={({ pressed }) => [
            styles.oauthButton,
            styles.oauthButtonOutlined,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
              opacity: pressed && !loading ? 0.7 : 1,
            },
          ]}
        >
          {loading === 'google' ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <>
              <GoogleG size={18} />
              <ThemedText type="sen-subheadline">Continue with Google</ThemedText>
            </>
          )}
        </Pressable>
      </FadeSlideIn>

      <FadeSlideIn delay={0.21}>
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
          <ThemedText
            type="sen-caption"
            lightColor={Colors.light.textMuted}
            darkColor={Colors.dark.textMuted}
            style={styles.dividerText}
          >
            or
          </ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
        </View>
      </FadeSlideIn>

      <FadeSlideIn delay={0.24}>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={palette.textMuted}
          value={email}
          onChangeText={onEmailChange}
          style={[
            styles.textInput,
            { backgroundColor: palette.bgSecondary, color: palette.text },
          ]}
        />
      </FadeSlideIn>

      <FadeSlideIn delay={0.27}>
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType={isSignup ? 'newPassword' : 'password'}
          placeholder="Password"
          placeholderTextColor={palette.textMuted}
          value={password}
          onChangeText={onPasswordChange}
          style={[
            styles.textInput,
            { backgroundColor: palette.bgSecondary, color: palette.text },
          ]}
        />
      </FadeSlideIn>

      {!isSignup && (
        <FadeSlideIn delay={0.29}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Forgot password"
            style={styles.forgotRow}
          >
            <ThemedText
              type="sen-caption-medium"
              lightColor={Colors.light.accent}
              darkColor={Colors.dark.accent}
            >
              Forgot password?
            </ThemedText>
          </Pressable>
        </FadeSlideIn>
      )}

      {error && <ErrorPill message={error} palette={palette} />}

      <FadeSlideIn delay={0.3}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSignup ? 'Create account' : 'Sign in'}
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryCta,
            {
              backgroundColor: palette.accent,
              opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {loading === 'email' ? (
            <ActivityIndicator color={palette.textInverse} />
          ) : (
            <ThemedText
              type="sen-headline"
              lightColor={Colors.light.textInverse}
              darkColor={Colors.dark.textInverse}
            >
              {isSignup ? 'Create account' : 'Sign in'}
            </ThemedText>
          )}
        </Pressable>
      </FadeSlideIn>

      <FadeSlideIn delay={0.32}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isSignup ? 'Switch to sign in' : 'Switch to sign up'
          }
          onPress={onModeChange}
          style={styles.modeToggleRow}
        >
          <ThemedText type="sen-label">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          </ThemedText>
          <ThemedText
            type="sen-label-bold"
            lightColor={Colors.light.accent}
            darkColor={Colors.dark.accent}
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </ThemedText>
        </Pressable>
      </FadeSlideIn>

      {isSignup && (
        <FadeSlideIn delay={0.34}>
          <ThemedText
            type="sen-legal"
            lightColor={Colors.light.textSecondary}
            darkColor={Colors.dark.textSecondary}
            style={styles.legalText}
          >
            By continuing you agree to the{' '}
            <ThemedText
              type="sen-legal"
              lightColor={Colors.light.accent}
              darkColor={Colors.dark.accent}
            >
              Terms
            </ThemedText>{' '}
            and{' '}
            <ThemedText
              type="sen-legal"
              lightColor={Colors.light.accent}
              darkColor={Colors.dark.accent}
            >
              Privacy Policy
            </ThemedText>
            .
          </ThemedText>
        </FadeSlideIn>
      )}
    </View>
  );
}

type VerifyStageProps = {
  email: string;
  code: string;
  loading: LoadingProvider;
  error: string | null;
  resendOk: boolean;
  canSubmit: boolean;
  otpInputRef: React.RefObject<TextInput | null>;
  onCodeChange: (v: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  palette: Palette;
};

function VerifyStage(props: VerifyStageProps) {
  const {
    email,
    code,
    loading,
    error,
    resendOk,
    canSubmit,
    otpInputRef,
    onCodeChange,
    onSubmit,
    onResend,
    palette,
  } = props;

  return (
    <View style={styles.formColumn}>
      <FadeSlideIn delay={0.1}>
        <ThemedText type="sen-large-title" style={styles.formHeadline}>
          Check your email
        </ThemedText>
      </FadeSlideIn>

      <FadeSlideIn delay={0.15}>
        <ThemedText
          type="sen-footnote"
          lightColor={Colors.light.textSecondary}
          darkColor={Colors.dark.textSecondary}
          style={styles.verifySubhead}
        >
          We sent an {OTP_LENGTH}-digit code to {email}.
        </ThemedText>
      </FadeSlideIn>

      <FadeSlideIn delay={0.2}>
        <Pressable
          accessibilityRole="text"
          accessibilityLabel="Verification code"
          onPress={() => otpInputRef.current?.focus()}
          style={styles.otpRow}
        >
          {Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const digit = code[i] ?? '';
            const isFocusedCell = i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.otpCell,
                  {
                    backgroundColor: digit ? palette.bgTertiary : palette.bgSecondary,
                    borderColor: isFocusedCell ? palette.accent : 'transparent',
                  },
                ]}
              >
                <ThemedText type="sen-title">{digit}</ThemedText>
              </View>
            );
          })}
          <TextInput
            ref={otpInputRef}
            value={code}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={OTP_LENGTH}
            style={styles.hiddenOtpInput}
            accessibilityLabel="Verification code input"
          />
        </Pressable>
      </FadeSlideIn>

      {error && <ErrorPill message={error} palette={palette} />}

      <FadeSlideIn delay={0.25}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Verify"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryCta,
            {
              backgroundColor: palette.accent,
              opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {loading === 'email' ? (
            <ActivityIndicator color={palette.textInverse} />
          ) : (
            <ThemedText
              type="sen-headline"
              lightColor={Colors.light.textInverse}
              darkColor={Colors.dark.textInverse}
            >
              Verify
            </ThemedText>
          )}
        </Pressable>
      </FadeSlideIn>

      <FadeSlideIn delay={0.3}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resend code"
          onPress={onResend}
          style={styles.resendRow}
        >
          {resendOk ? (
            <View style={styles.resendOk}>
              <IconSymbol name="checkmark" size={14} color={palette.success} />
              <ThemedText
                type="sen-caption-bold"
                lightColor={Colors.light.success}
                darkColor={Colors.dark.success}
              >
                Code sent
              </ThemedText>
            </View>
          ) : (
            <ThemedText
              type="sen-caption"
              lightColor={Colors.light.textMuted}
              darkColor={Colors.dark.textMuted}
            >
              Resend code
            </ThemedText>
          )}
        </Pressable>
      </FadeSlideIn>
    </View>
  );
}

function ErrorPill({ message, palette }: { message: string; palette: Palette }) {
  return (
    <FadeSlideIn delay={0}>
      <View
        accessibilityLiveRegion="polite"
        style={[styles.errorPill, { backgroundColor: palette.errorBg }]}
      >
        <ThemedText
          type="sen-caption"
          lightColor={Colors.light.error}
          darkColor={Colors.dark.error}
        >
          {message}
        </ThemedText>
      </View>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 16,
  },
  formColumn: {
    gap: 12,
  },
  formHeadline: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  oauthButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  oauthButtonOutlined: {
    borderWidth: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    paddingHorizontal: 4,
  },
  textInput: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  primaryCta: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
  legalText: {
    textAlign: 'center',
    paddingTop: 8,
    maxWidth: 320,
    alignSelf: 'center',
  },
  verifySubhead: {
    textAlign: 'left',
    paddingBottom: 16,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    position: 'relative',
  },
  otpCell: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  resendRow: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
