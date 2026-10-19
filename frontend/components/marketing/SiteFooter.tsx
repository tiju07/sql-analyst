import { REPO_URL } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:justify-between sm:px-6">
        <p>
          Data: Brazilian E-Commerce Public Dataset by Olist (
          <a
            className="underline underline-offset-4"
            href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce"
          >
            Kaggle
          </a>
          , CC BY-NC-SA 4.0). A non-commercial portfolio project.
        </p>
        <p className="flex gap-4">
          <a className="underline underline-offset-4" href={REPO_URL}>
            Source code
          </a>
          <a className="underline underline-offset-4" href={`${REPO_URL}/blob/main/ARCHITECTURE.md`}>
            Architecture
          </a>
        </p>
      </div>
    </footer>
  )
}
