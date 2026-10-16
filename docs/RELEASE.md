# Getting the app onto phones

Three ways, from now to launch. Checked against Expo's docs on 2026-10-16 (SDK 57, eas-cli 25).

| | Needs the Mac running? | Who can install | Lasts | Cost |
|---|---|---|---|---|
| Development build (`pnpm ios:device`, today's setup) | Yes: loads code from `expo start` on the same Wi-Fi | Cameron's iPhone | 7 days (free Apple ID) | Free |
| Release build (`pnpm ios:release`) | No: code is inside the app | Cameron's iPhone | 7 days (free Apple ID) | Free |
| TestFlight (`pnpm testflight`) | No | Anyone invited (up to 10,000 external testers) | 90 days per build | Apple Developer Program, $99/year |

## 1. Release build on your own iPhone (free)

The app works anywhere: on cellular, away from the Mac, with the Mac off. It saves to Supabase as usual.

1. Plug the iPhone into the Mac and unlock it.
2. In Terminal, in the project folder, run `git pull`, then `pnpm ios:release`.
3. When it finishes, open the app on the phone. It doesn't look for a server.

Notes:
- **Changes need a reinstall.** Run the same command to get a new version onto the phone. For day-to-day building, switch back to `pnpm ios:device` and `npx expo start`.
- **It reads the Supabase settings from `apps/mobile/.env.local`,** so it talks to the same live project.
- **Free Apple ID builds stop opening after 7 days.** Re-run the command to renew.

## 2. TestFlight for testers (after joining the Apple Developer Program)

### One-time setup (Cameron, about 30 minutes)
1. Join the Apple Developer Program at developer.apple.com with the Apple ID used in Xcode. This is a paid sign-up and Cameron's decision. Apple's approval can take a day or two.
2. Create a free Expo account at expo.dev.
3. In Terminal, in `apps/mobile`:
   - `npx eas-cli@latest login`
   - `npx eas-cli@latest init`. This links the project to the Expo account and adds a project id to `app.json`; commit that change.
4. Store the two public Supabase settings for cloud builds. They are already public in the app; never store the secret key here.
   - `npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value <project URL> --environment production --visibility plaintext`
   - `npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable key> --environment production --visibility plaintext`

### Each release
- From the project folder, run `pnpm testflight`. Expo builds the app in the cloud, signs it with Apple (it asks you to sign in to Apple the first time), and uploads it to TestFlight. Apple takes about 5–10 minutes to process it.
- Check Expo's current free-tier build limits at expo.dev before relying on them.

### Inviting testers (App Store Connect → the app → TestFlight)
1. **Internal group first:** create one with **+** next to Internal Testing and add yourself. Apple requires an internal group before an external one.
2. **External group:** create one with **+** next to External Testing and add the build.
3. **Test information:** fill in the beta description, a feedback email, and a test sign-in account for Apple's reviewer.
4. **Beta App Review:** submit the build. The first build of each version is reviewed; Apple emails you when it's approved.
5. **Invite testers** by email or a public link. They install Apple's free TestFlight app and tap the link.

## 3. Before anyone else uses it (checklist)

- [ ] Turn Supabase email confirmation back on (CLAUDE.md status).
- [ ] Privacy policy page (what we collect, why, how to delete it) with its link in the app and App Store Connect.
- [ ] Delete my account in the app (required before the App Store; strongly advised for testers).
- [ ] "Send feedback" in the Account menu.
- [ ] A real app icon and name check (`apps/mobile/assets/icon.png` is still the Expo default).
- [ ] A test account for Apple's reviewer.

## Android (later)
`eas build --platform android --profile preview` produces an installable file that testers can download directly, without the Play Store. Apple Health doesn't exist on Android; Health Connect would be its equivalent.
