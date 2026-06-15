import PosturaApp from '@/components/PosturaApp';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import React from 'react'

export default async function page() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return redirect('/sign-in');
  }
  return (
    <PosturaApp />
  )
}
