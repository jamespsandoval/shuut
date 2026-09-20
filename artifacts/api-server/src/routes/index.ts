import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shuutRouter from "./shuut";
import moderationRouter from "./moderation";
import voiceAiConsentRouter from "./voiceAiConsent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shuutRouter);
router.use(moderationRouter);
router.use(voiceAiConsentRouter);

export default router;
