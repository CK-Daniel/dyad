import { dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import { createLoggedHandler } from "./safe_handle";
import log from "electron-log";
import { getDyadAppPath } from "../../paths/paths";
import { apps } from "@/db/schema";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { eq } from "drizzle-orm";
import git from "isomorphic-git";
import { getGitAuthor } from "../utils/git_author";
import { ImportAppParams, ImportAppResult } from "../ipc_types";

const logger = log.scope("import-handlers");
const handle = createLoggedHandler(logger);

// Helper function to detect WordPress project
async function detectWordPressProject(projectPath: string): Promise<'wordpress' | 'react'> {
  try {
    // Check for WordPress indicators
    const wpConfigExists = await fs.access(path.join(projectPath, 'wp-config.php'))
      .then(() => true).catch(() => false);
    const wpContentExists = await fs.access(path.join(projectPath, 'wp-content'))
      .then(() => true).catch(() => false);
    const wordpressExists = await fs.access(path.join(projectPath, 'wordpress', 'wp-content'))
      .then(() => true).catch(() => false);
    
    if (wpConfigExists || wpContentExists || wordpressExists) {
      return 'wordpress';
    }
    
    return 'react';
  } catch {
    return 'react';
  }
}

export function registerImportHandlers() {
  // Handler for selecting an app folder
  handle("select-app-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select App Folder to Import",
    });

    if (result.canceled) {
      return { path: null, name: null, appType: null };
    }

    const selectedPath = result.filePaths[0];
    const folderName = path.basename(selectedPath);
    const appType = await detectWordPressProject(selectedPath);

    return { path: selectedPath, name: folderName, appType };
  });

  // Handler for checking if AI_RULES.md exists
  handle("check-ai-rules", async (_, { path: appPath }: { path: string }) => {
    try {
      await fs.access(path.join(appPath, "AI_RULES.md"));
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

  // Handler for checking if an app name is already taken
  handle("check-app-name", async (_, { appName }: { appName: string }) => {
    // Check filesystem
    const appPath = getDyadAppPath(appName);
    try {
      await fs.access(appPath);
      return { exists: true };
    } catch {
      // Path doesn't exist, continue checking database
    }

    // Check database
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.name, appName),
    });

    return { exists: !!existingApp };
  });

  // Handler for importing an app
  handle(
    "import-app",
    async (
      _,
      { path: sourcePath, appName, appType }: ImportAppParams & { appType?: 'react' | 'wordpress' },
    ): Promise<ImportAppResult> => {
      // Validate the source path exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error("Source folder does not exist");
      }

      const destPath = getDyadAppPath(appName);

      // Check if the app already exists
      const errorMessage = "An app with this name already exists";
      try {
        await fs.access(destPath);
        throw new Error(errorMessage);
      } catch (error: any) {
        if (error.message === errorMessage) {
          throw error;
        }
      }

      // Detect app type if not provided
      const detectedAppType = appType || await detectWordPressProject(sourcePath);

      // Copy the app folder to the Dyad apps directory, excluding node_modules
      await fs.cp(sourcePath, destPath, {
        recursive: true,
        filter: (source) => !source.includes("node_modules"),
      });

      // For WordPress projects, ensure AI_RULES.md exists
      if (detectedAppType === 'wordpress') {
        const aiRulesPath = path.join(destPath, 'AI_RULES.md');
        const aiRulesExists = await fs.access(aiRulesPath).then(() => true).catch(() => false);
        
        if (!aiRulesExists) {
          // Copy WordPress AI_RULES.md from scaffold
          const scaffoldAiRulesPath = path.join(__dirname, '../../../scaffold-wordpress/AI_RULES.md');
          try {
            await fs.copyFile(scaffoldAiRulesPath, aiRulesPath);
          } catch (err) {
            logger.warn('Could not copy WordPress AI_RULES.md from scaffold:', err);
          }
        }
      }

      const isGitRepo = await fs
        .access(path.join(destPath, ".git"))
        .then(() => true)
        .catch(() => false);
      if (!isGitRepo) {
        // Initialize git repo and create first commit
        await git.init({
          fs: fs,
          dir: destPath,
          defaultBranch: "main",
        });

        // Stage all files
        await git.add({
          fs: fs,
          dir: destPath,
          filepath: ".",
        });

        // Create initial commit
        await git.commit({
          fs: fs,
          dir: destPath,
          message: "Init Dyad app",
          author: await getGitAuthor(),
        });
      }

      // Create a new app
      const [app] = await db
        .insert(apps)
        .values({
          name: appName,
          // Use the name as the path for now
          path: appName,
          appType: detectedAppType,
        })
        .returning();

      // Create an initial chat for this app
      const [chat] = await db
        .insert(chats)
        .values({
          appId: app.id,
        })
        .returning();
      return { appId: app.id, chatId: chat.id };
    },
  );

  logger.debug("Registered import IPC handlers");
}
