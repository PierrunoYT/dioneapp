## Project Status

Dione had an amazing 2025, with **25k+ downloads** and **10k+ users**.

As of 2026, the original maintainers have stepped back from day-to-day maintenance. Dione is now community-maintained, and pull requests, new scripts, fixes, and documentation improvements are welcome.

The former account and login features have been removed. Current project information and releases are published in this GitHub repository.

# Dione: Explore, Install, Innovate — in 1 Click

**Dione** makes installing complex applications as simple as clicking a button — no terminal or technical knowledge needed.

For developers, Dione offers a zero-friction way to distribute apps using just a JSON file.

**It has never been easier to install AI on your computer**

## Showcase

![Demo](https://i.imgur.com/wC8MF9C.png)

## Download

Download the latest release for your platform from [GitHub Releases](https://github.com/pierrunoyt/dioneapp/releases).

## Documentation

**Want to create and distribute apps with Dione?** See the project documentation and examples in the [Dione repository](https://github.com/pierrunoyt/dioneapp) for guidance on scripts and app packaging.

## Contributing

If you're interested in contributing or running Dione locally, follow these steps:

### Prerequisites

* [Node.js](https://nodejs.org/en/download/)
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

### Run Locally

```bash
# Clone the repo
git clone https://github.com/pierrunoyt/dioneapp.git
cd dioneapp

# Install dependencies
npm ci

# Start development server
npm run dev
```

> **Yes, it really is this easy.** Despite how powerful Dione is, the development setup is genuinely this simple. Please note that some functions requiring database calls may have limitations in local development.

### Production Build

Set `platform` as one of: win, mac, linux

```bash
npm run build:[platform]
```

## Community and Security

Community support is provided through [GitHub Issues](https://github.com/pierrunoyt/dioneapp/issues). Because maintainers are volunteers, response times and support are not guaranteed.

Please report security vulnerabilities privately through [GitHub Security Advisories](https://github.com/pierrunoyt/dioneapp/security/advisories/new), rather than opening a public issue.
