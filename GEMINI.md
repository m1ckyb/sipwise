# Workflow & Changelog

CRITICAL: Every time you make a change to the codebase that affects functionality, user experience, or configuration (features, bug fixes, refactoring, style updates), you MUST follow these steps:

    Update unreleased.md:
        Format: Follow the Keep a Changelog convention.
        Categories: Use sub-headers like ### Added, ### Changed, ### Fixed, ### Removed.
        Content: Be concise but descriptive. Explain what changed and why.
        Process: Perform the unreleased.md update in the same turn as the code changes.

    Update README.md:
        Ensure the documentation reflects any changes to features, configuration, or usage.
        Perform this update in the same turn as the code changes.

    Verify Local Build:
        After making changes, always run the build command to ensure the project compiles successfully and verify the fix/feature.
        Command: npm run build

    Git Push Restriction:
        NEVER push code to GitHub (e.g., git push) unless the user explicitly instructs you to do so.
        Only commit changes locally unless told otherwise.

# Release Process

When requested to "Make a dev release":

    Push to Dev: Push the current code to the dev branch.

When requested to "Make a release", where <type> is Patch, Minor, or Major, the following steps must be performed on the dev branch based on Semantic Versioning:

    Determine New Version: Read the current version from VERSION.txt (e.g., X.Y.Z).
        For a Patch release, the new version will be X.Y.(Z+1).
        For a Minor release, the new version will be X.(Y+1).0.
        For a Major release, the new version will be (X+1).0.0.
        For a Release Candidate (RC) release:
            - If the current version is NOT an RC release (e.g., X.Y.Z), the new version will be X.Y.(Z+1)-rc1.
            - If the current version IS already an RC release (e.g., X.Y.Z-rcW), the new version will be X.Y.Z-rc(W+1).
            - Note: RC releases must always be tagged as a pre-release on GitHub (using the `--prerelease` flag).

    Update CHANGELOG.md:
        Create a new version heading with the new version number and current date (e.g., ## [1.0.0] - YYYY-MM-DD).
        Move only the content from unreleased.md that hasn't been released yet into this new section.
        CRITICAL: Ensure you do not duplicate entries already present in older versions of CHANGELOG.md.
        Do not add an [Unreleased] section back to the top of CHANGELOG.md.

    Clear unreleased.md: After moving the content, reset unreleased.md to an empty state (or just the sub-headers) to prevent those changes from being included in the next release.

    Update VERSION.txt: Change the content of VERSION.txt to the new version number.

    Update package.json version: Change the "version" field in package.json to match VERSION.txt. The ProfileSettings page reads this field to display the version number (e.g., SipWise v0.1.18).


    Update Documentation: Review README.md and other docs to reflect new features or significant changes.

    Push to Dev: Commit and push all release-related changes to the dev branch.

    Merge to Main: Checkout main, merge dev, and push to origin main.

    GitHub Release: Use the gh CLI to create a release/pre-release on GitHub, using the notes extracted from the changelog.
        Command: gh release create vX.Y.Z --title "vX.Y.Z - Description" --notes "content from changelog" --prerelease
