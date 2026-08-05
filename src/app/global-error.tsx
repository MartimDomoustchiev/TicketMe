"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            alignItems: "center",
            background: "#f8fafc",
            display: "flex",
            fontFamily: "Arial, sans-serif",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <section>
            <h1>
              Tiketko is temporarily unavailable / временно не е достъпен
            </h1>
            <p>
              Please try loading the page again. / Опитай да заредиш страницата
              отново.
            </p>
            <button type="button" onClick={() => unstable_retry()}>
              Reload / Зареди отново
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
