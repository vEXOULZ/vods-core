<script setup lang="ts">
// The header's account control, wired to the shared sign-in (@vexoulz/ui/account, set up by createVodsApp()). A dashboard session signed in
// with the admin password (no account) shows as "admin". Signing out ends both, and forgets this browser's quiet
// admin check for the account (admin/quiet.ts).
import { VxAccountMenu, VxMenuItem, type AccountUser } from '@vexoulz/ui'
import { useAccount } from '@vexoulz/ui/account'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { forget } from '../admin/quiet'
import { logout, session } from '../admin/session'

const account = useAccount()
const route = useRoute()
const router = useRouter()

const user = computed<AccountUser | null>(() => {
  if (account.menuUser.value) return account.menuUser.value
  return session.authenticated ? { name: session.user?.displayName ?? 'admin' } : null
})
const note = computed(() => (session.authenticated ? 'archive admin' : undefined))

async function signOut() {
  try {
    if (session.authenticated) await logout()
  } catch {
    // the session is dropped here either way
  }
  const id = account.user.value?.id
  if (id) {
    forget(id)
    await account.signOut({ everywhere: true })
  }
  if (route.path.startsWith('/manage')) router.push('/')
}
</script>

<template>
  <VxAccountMenu
    :user="user"
    :note="note"
    :disabled="!account.enabled"
    @sign-in="account.signIn()"
    @sign-out="signOut"
  >
    <template #default="{ close }">
      <VxMenuItem v-if="session.authenticated" to="/manage" @click="close()">Manage</VxMenuItem>
      <slot :close="close"></slot>
    </template>
  </VxAccountMenu>
</template>
