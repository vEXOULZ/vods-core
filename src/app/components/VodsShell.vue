<script setup lang="ts">
// Frame for every page: the site shell with the public nav, the account menu (the shared sign-in), and a "Manage"
// button in the header while an admin's dashboard session is live (the Manage bar itself is on the Manage pages,
// admin/ManageShell.vue). Slots pass through to VxSiteShell.
import { VxSiteShell } from '@vexoulz/ui'
import { session } from '../admin/session'
import AccountMenu from './AccountMenu.vue'
import ManageLink from './ManageLink.vue'
import { nav } from '../lib/nav'
import { site } from '../site'

withDefaults(defineProps<{ fill?: boolean; header?: boolean; sky?: 'full' | 'dim' | 'off' }>(), { header: true })
</script>

<template>
  <VxSiteShell :site="site.id" :nav="nav()" :fill="fill" :header="header" :sky="sky">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}"></slot></template>
    <template v-if="!$slots.actions && session.authenticated" #actions>
      <ManageLink />
    </template>
    <template v-if="!$slots.account" #account>
      <AccountMenu />
    </template>
  </VxSiteShell>
</template>
