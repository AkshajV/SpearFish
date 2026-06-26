// web/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Dynamically select the backend URL based on environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.email) {
        // Now it will use Render in production, and localhost during local dev!
        await fetch(`${BACKEND_URL}/api/users/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });
      }
      return true;
    },
  },
});
