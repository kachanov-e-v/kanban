import { getProfile } from "@/lib/actions/profile";
import { ProfileView } from "@/components/profile/profile-view";

export default async function ProfilePage() {
  const profile = await getProfile();
  return <ProfileView initial={profile} />;
}