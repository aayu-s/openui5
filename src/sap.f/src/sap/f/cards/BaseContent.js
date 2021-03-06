/*!
 * ${copyright}
 */
sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/model/json/JSONModel",
	"sap/f/cards/DataProviderFactory",
	"sap/base/Log",
	"sap/ui/core/Core"
], function (Control, JSONModel, DataProviderFactory, Log, Core) {
	"use strict";

	/**
	 * Constructor for a new <code>BaseContent</code>.
	 *
	 * @param {string} [sId] ID for the new control, generated automatically if no ID is given
	 * @param {object} [mSettings] Initial settings for the new control
	 *
	 * @class
	 * A base control for all card contents.
	 *
	 * @extends sap.ui.core.Control
	 *
	 * @author SAP SE
	 * @version ${version}
	 *
	 * @constructor
	 * @private
	 * @since 1.63
	 * @alias sap.f.cards.BaseContent
	 */
	var BaseContent = Control.extend("sap.f.cards.BaseContent", {
		metadata: {
			aggregations: {

				/**
				 * Defines the content of the control.
				 */
				_content: {
					multiple: false,
					visibility: "hidden"
				}
			}
		},
		renderer: function (oRm, oCardContent) {

			// Add class the simple way. Add renderer hooks only if needed.
			var sClass = "sapFCard";
			var sLibrary = oCardContent.getMetadata().getLibraryName();
			var sName = oCardContent.getMetadata().getName();
			var sType = sName.slice(sLibrary.length + 1, sName.length);
			var sHeight = BaseContent.getMinHeight(sType, oCardContent.getConfiguration());
			var oCard = oCardContent.getParent();
			sClass += sType;

			oRm.write("<div");
			oRm.writeElementData(oCardContent);
			oRm.addClass(sClass);
			oRm.addClass("sapFCardBaseContent");
			oRm.writeClasses();

			if (oCard && oCard.isA("sap.f.ICard") && oCard.getHeight() === "auto") { // if there is no height specified the default value is "auto"
				oRm.addStyle("min-height", sHeight);
			}

			oRm.writeStyles();
			oRm.write(">");

			oRm.renderControl(oCardContent.getAggregation("_content"));

			oRm.write("</div>");
		}
	});

	BaseContent.prototype.destroy = function () {
		this.setAggregation("_content", null);
		this.setModel(null);
		if (this._oDataProvider) {
			this._oDataProvider.destroy();
			this._oDataProvider = null;
		}
		return Control.prototype.destroy.apply(this, arguments);
	};

	BaseContent.prototype.setConfiguration = function (oConfiguration) {

		this._oConfiguration = oConfiguration;

		if (!oConfiguration) {
			return this;
		}

		this._setData(oConfiguration.data);

		if (oConfiguration.maxItems) {
			this.getModel().setSizeLimit(oConfiguration.maxItems);
		}

		return this;
	};

	BaseContent.prototype.getConfiguration = function () {
		return this._oConfiguration;
	};

	/**
	 * Requests data and bind it to the item template.
	 *
	 * @private
	 * @param {Object} oDataSettings The data part of the configuration object
	 */
	BaseContent.prototype._setData = function (oDataSettings) {
		var sPath = "/";
		if (oDataSettings && oDataSettings.path) {
			sPath = oDataSettings.path;
		}

		if (this._oDataProvider) {
			this._oDataProvider.destroy();
		}

		this._oDataProvider = DataProviderFactory.create(oDataSettings, this._oServiceManager);

		if (this._oDataProvider) {
			this.setBusy(true);

			// If a data provider is created use an own model. Otherwise bind to the one propagated from the card.
			this.setModel(new JSONModel());

			this._oDataProvider.attachDataChanged(function (oEvent) {
				this._updateModel(oEvent.getParameter("data"));
				this.setBusy(false);
			}.bind(this));
			this._oDataProvider.attachError(function (oEvent) {
				this._handleError(oEvent.getParameter("message"));
				this.setBusy(false);
			}.bind(this));

			this._oDataProvider.triggerDataUpdate();
		}

		this.bindObject(sPath);
	};

	/**
	 * Updates the model and binds the data to the list.
	 *
	 * @private
	 * @param {Object} oData The data to set.
	 */
	BaseContent.prototype._updateModel = function (oData) {
		this.getModel().setData(oData);

		// Have to trigger _updated on the first onAfterRendering after _updateModel is called.
		setTimeout(function () {
			this.fireEvent("_updated");
		}.bind(this), 0);
	};

	BaseContent.prototype._handleError = function (sLogMessage) {
		this.fireEvent("_error", { logMessage: sLogMessage });
	};

	BaseContent.prototype.setServiceManager = function (oServiceManager) {
		this._oServiceManager = oServiceManager;
		return this;
	};

	BaseContent.create = function (sType, oConfiguration, oServiceManager) {
		return new Promise(function (resolve, reject) {
			var fnCreateContentInstance = function (Content) {
				var oContent = new Content();
				oContent.setServiceManager(oServiceManager);
				oContent.setConfiguration(oConfiguration);
				resolve(oContent);
			};

			try {
				switch (sType.toLowerCase()) {
					case "list":
						sap.ui.require(["sap/f/cards/ListContent"], fnCreateContentInstance);
						break;
					case "table":
						sap.ui.require(["sap/f/cards/TableContent"], fnCreateContentInstance);
						break;
					case "object":
						sap.ui.require(["sap/f/cards/ObjectContent"], fnCreateContentInstance);
						break;
					case "analytical":
						Core.loadLibrary("sap.viz", {
								async: true
							})
							.then(function () {
								sap.ui.require(["sap/f/cards/AnalyticalContent"], fnCreateContentInstance);
							})
							.catch(function () {
								reject("Analytical content type is not available with this distribution.");
							});
						break;
					case "timeline":
						Core.loadLibrary("sap.suite.ui.commons", {
								async: true
							})
							.then(function() {
								sap.ui.require(["sap/f/cards/TimelineContent"], fnCreateContentInstance);
							})
							.catch(function () {
								reject("Timeline content type is not available with this distribution.");
							});
						break;
					case "component":
						sap.ui.require(["sap/f/cards/ComponentContent"], fnCreateContentInstance);
						break;
					default:
						Log.error(sType.toUpperCase() + " content type is not supported.");
				}
			} catch (sError) {
				reject(sError);
			}
		});
	};

	BaseContent.getMinHeight = function (sType, oContent) {

		var MIN_HEIGHT = 5,
			iHeight;

		if (jQuery.isEmptyObject(oContent)) {
			return "0rem";
		}

		switch (sType) {
			case "ListContent":
				iHeight = BaseContent._getMinListHeight(oContent); break;
			case "TableContent":
				iHeight = BaseContent._getMinTableHeight(oContent); break;
			case "TimelineContent":
				iHeight = BaseContent._getMinTimelineHeight(oContent); break;
			case "AnalyticalContent":
				iHeight = 14; break;
			case "ObjectContent":
				iHeight = 0; break;
			default:
				iHeight = 0;
		}

		return  (iHeight !== 0 ? iHeight : MIN_HEIGHT) + "rem";
	};

	BaseContent._getMinListHeight = function (oContent) {
		var iCount = oContent.maxItems || 0,
			oTemplate = oContent.item,
			iItemHeight = 3;

		if (!oTemplate) {
			return 0;
		}

		if (oTemplate.icon || oTemplate.description) {
			iItemHeight = 4;
		}

		return iCount * iItemHeight;
	};

	BaseContent._getMinTableHeight = function (oContent) {
		var iCount = oContent.maxItems || 0,
			iRowHeight = 3,
			iTableHeaderHeight = 3;

		return iCount * iRowHeight + iTableHeaderHeight;
	};

	BaseContent._getMinTimelineHeight = function (oContent) {
		var iCount = oContent.maxItems || 0,
			iItemHeight = 6;

		return iCount * iItemHeight;
	};

	return BaseContent;
});
