import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ipRouter from "./ip";
import websiteRouter from "./website";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ipRouter);
router.use(websiteRouter);

export default router;
