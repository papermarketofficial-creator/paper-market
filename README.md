# Learn NSE Play - Paper Trading Platform

A modern, production-ready paper trading platform built with Next.js App Router, featuring real-time charts, portfolio management, and comprehensive trading analytics.

## 🚀 Features

- **Paper Trading**: Practice NSE stock trading with virtual money
- **Real-time Charts**: Interactive candlestick and equity charts using Lightweight Charts
- **Portfolio Management**: Track positions, P&L, and trading history
- **Trading Journal**: Document and analyze your trades
- **Responsive Design**: Mobile-first UI with Tailwind CSS and Shadcn UI
- **Dark/Light Themes**: Theme switching with next-themes
- **TypeScript**: Fully typed codebase with strict mode

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Charts**: Lightweight Charts
- **Icons**: Lucide React
- **Notifications**: Sonner

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd learn-nse-play
```

2. Install dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗 Build & Deployment

### Build Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

### Environment Variables

No environment variables are required for basic functionality. The app uses mock data for demonstration.

For production deployment, consider adding:
- Database connection strings
- API keys for real market data
- Authentication providers

### Deployment Checklist

- [ ] Run `npm run build` successfully
- [ ] Test all routes and functionality
- [ ] Verify responsive design on mobile/desktop
- [ ] Check charts load without SSR issues
- [ ] Ensure no TypeScript errors
- [ ] Validate metadata and SEO tags
- [ ] Test theme switching
- [ ] Verify form submissions and state management

## 📁 Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/       # Dashboard route group
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # Reusable UI components
│   ├── ui/               # Shadcn UI components
│   ├── dashboard/        # Dashboard-specific components
│   └── layout/           # Layout components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
├── stores/               # Zustand state stores
├── data/                 # Mock data and constants
└── public/               # Static assets
```

## 🔧 Configuration

- **TypeScript**: Strict mode enabled
- **ESLint**: React and TypeScript rules
- **Tailwind**: Custom theme with CSS variables
- **Next.js**: Optimized for production

## 📈 Performance

- Dynamic imports for heavy components
- Suspense boundaries for loading states
- Client-side rendering for interactive features
- Optimized bundle splitting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
