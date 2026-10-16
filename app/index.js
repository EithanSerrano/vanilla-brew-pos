import { Redirect } from 'expo-router';

export default function EntryPoint() {
  // This instantly sends the user to /login
  return <Redirect href="/login" />;
}