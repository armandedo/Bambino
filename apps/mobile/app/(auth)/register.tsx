import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Body, Button, Field, Heading, Screen } from '@/components/ui';
import { errorMessage, fieldProblems } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { colors, space } from '@/theme';

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: 44 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: colors['border-strong'],
          backgroundColor: checked ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: colors['primary-foreground'], fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: colors.foreground }}>{label}</Text>
    </Pressable>
  );
}

export default function Register() {
  const { register } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [childData, setChildData] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    setProblem(null);
    setFields({});
    if (!terms || !childData) {
      setProblem('Please accept the terms and the use of your baby’s details to continue.');
      return;
    }
    setBusy(true);
    try {
      await register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() ? phone.trim() : null,
        consents: [
          {
            type: 'TERMS_OF_SERVICE',
            documentVersion: LEGAL_DOCUMENT_VERSIONS.TERMS_OF_SERVICE,
            granted: true,
          },
          { type: 'PRIVACY_POLICY', documentVersion: LEGAL_DOCUMENT_VERSIONS.PRIVACY_POLICY, granted: true },
          {
            type: 'CHILD_DATA_PROCESSING',
            documentVersion: LEGAL_DOCUMENT_VERSIONS.CHILD_DATA_PROCESSING,
            granted: true,
          },
          { type: 'MARKETING', documentVersion: LEGAL_DOCUMENT_VERSIONS.MARKETING, granted: marketing },
        ],
      });
    } catch (error) {
      setProblem(errorMessage(error));
      setFields(fieldProblems(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>Create your account</Heading>
      <Body muted>It takes a minute. You can add your baby’s details afterwards.</Body>
      {problem ? <Banner tone="danger">{problem}</Banner> : null}
      <Field
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        error={fields.firstName}
      />
      <Field
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        error={fields.lastName}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        error={fields.email}
      />
      <Field
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+250 78 000 0000"
        error={fields.phone}
      />
      <Field
        label="Password (at least 10 characters)"
        value={password}
        onChangeText={setPassword}
        secure
        error={fields.password}
      />
      <Check
        checked={terms}
        onChange={setTerms}
        label="I accept the Terms of Service and the Privacy Policy."
      />
      <Check
        checked={childData}
        onChange={setChildData}
        label="I agree that Bambino keeps my baby’s size details to recommend clothes."
      />
      <Check checked={marketing} onChange={setMarketing} label="Send me offers and news (optional)." />
      <Button label="Create account" onPress={submit} loading={busy} />
      <Link href="/sign-in" style={{ textAlign: 'center', fontSize: 16, padding: 12 }}>
        Already have an account? Sign in
      </Link>
    </Screen>
  );
}
