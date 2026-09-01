<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'
import { buttonVariants, type ButtonVariants } from './index'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    class?: string
  }>(),
  { type: 'button', disabled: false },
)

const classes = computed(() =>
  cn(buttonVariants({ variant: props.variant, size: props.size }), props.class),
)
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
