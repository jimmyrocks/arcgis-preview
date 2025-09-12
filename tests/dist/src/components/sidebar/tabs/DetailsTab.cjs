"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DetailsTab;
const jsx_runtime_1 = require("react/jsx-runtime");
const DetailsPanel_1 = require("../components/DetailsPanel");
function DetailsTab({ serviceMeta, layerMeta, featureCount, onZoomToExtent, serviceUrl }) {
    return ((0, jsx_runtime_1.jsx)(DetailsPanel_1.default, { serviceMeta: serviceMeta, layerMeta: layerMeta, loading: false, isDynamic: false, onZoomToExtent: onZoomToExtent, featureCount: featureCount, serviceUrl: serviceUrl }));
}
