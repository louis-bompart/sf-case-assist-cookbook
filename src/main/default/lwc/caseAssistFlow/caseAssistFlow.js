import { LightningElement, track, api } from 'lwc';
import {
  FlowAttributeChangeEvent,
  FlowNavigationNextEvent
} from 'lightning/flowSupport';

import CaseAssistEndpoint from 'c/caseAssistEndpoint';
import { debounce } from 'c/utils';
import { analyticsActionNames } from 'c/analyticsActionNames';
import { coveoua } from 'c/analyticsBeacon';

const COVEO_REASON_FIELD_NAME = 'sfreason';

export default class CaseAssistFlow extends LightningElement {
  /**
   * availableActions is an array that contains the available flow actions when this component is used within a flow
   * @see https://developer.salesforce.com/docs/component-library/bundle/lightning-flow-support/documentation
   */
  @api availableActions = [];

  /**
   * This is the main title of the screen.
   */
  @api heading = 'How can we help you today?';

  /**
   * The title of the sub-section below Subject and Description
   */
  @api subHeading = 'Select related categories';

  @track theCase = {};
  @track fieldSuggestions = [];

  constructor() {
    super();

    // Case Assist Endpoint
    this.endpoint = new CaseAssistEndpoint();

    // Debounce function for "search-as-you-type" it will trigger when there is no key stroke for 500ms.
    this.debounceHandler = debounce(async () => {
      try {
        const classificationData = await this.endpoint.fetchCaseClassifications(
          this.theCase.Subject,
          this.theCase.Description,
          this.theCase.visitorId || 'foo' //TODO: Get the VisitorId from the community.
        );
        this.parseFieldSuggestions(classificationData);
      } catch (err) {
        console.error(err);
      }
    }, 500);
  }

  /**
   * caseData is the variable that will be accessible as an output variable to the Flow.
   * @see https://developer.salesforce.com/docs/component-library/bundle/lightning-flow-support/documentation
   */
  @api
  get caseData() {
    return this._caseData;
  }

  set caseData(caseData) {
    this._caseData = caseData;
  }

  connectedCallback() {
    // On component connect, send a ticket_create_start since this is the first screen.
    this.sendTicketCreateStart();
  }

  // When the subject/description of the case changes.
  handleFormInputChange(event) {
    this.theCase[event.target.fieldName] = event.target.value;
    this.sendTicketFieldUpdated(event.target.fieldName);
    this.updateFlowState();
    if (this.shouldShowSuggestions) {
      // Trigger the API call to get field suggestions.
      this.debounceHandler();
    }
  }

  // Parse the data from the suggestions
  parseFieldSuggestions(suggestionsData) {
    // TODO: store the lastResponseID from the API response.
    // this.lastResponseId = suggestionsData.responseId?
    this.fieldSuggestions = suggestionsData || {};
  }

  // Returns the field suggestions specific to the reason field.
  get reasonSuggestions() {
    let reasonSuggestions = [];
    if (
      this.fieldSuggestions &&
      this.fieldSuggestions[COVEO_REASON_FIELD_NAME]
    ) {
      reasonSuggestions = this.fieldSuggestions[COVEO_REASON_FIELD_NAME]
        .predictions;
    }
    return reasonSuggestions;
  }

  // Specific rule to hide the field section of the UI until the user has entered enough information in the text fields.
  get shouldShowSuggestions() {
    return (
      this.theCase.Subject &&
      this.theCase.Description &&
      this.theCase.Description.length >= 10
    );
  }

  // When a picklist value is selected.
  handlePicklistChange(event) {
    this.theCase[event.target.fieldName] = event.target.value;
    this.sendTicketFieldUpdated(event.target.fieldName);
    this.updateFlowState();
  }

  // When a suggestion badge is clicked under a picklist.
  handleSuggestionSelected(event) {
    const fieldToSet = event.detail.fieldName;
    const picklistToSet = this.template.querySelector(
      `lightning-input-field[data-field-name=${fieldToSet}]`
    );
    picklistToSet.value = event.detail.value;
    this.theCase[fieldToSet] = event.detail.value;

    this.sendTicketClassificationClick(event.detail);

    this.updateFlowState();
  }

  // This method is used to notify the flow of the change to the case fields values.
  updateFlowState() {
    this._caseData = JSON.stringify(this.theCase);
    const attributeChangeEvent = new FlowAttributeChangeEvent(
      'caseData',
      this._caseData
    );
    this.dispatchEvent(attributeChangeEvent);
  }

  handleButtonNext() {
    // check if NEXT is allowed on this screen
    if (this.availableActions.some((action) => action === 'NEXT')) {
      this.sendTicketNextStage();
      const navigateNextEvent = new FlowNavigationNextEvent();
      this.dispatchEvent(navigateNextEvent);
    }
  }

  // Handling Analytics
  sendTicketCreateStart() {
    coveoua('svc:setAction', analyticsActionNames.TICKET_CREATE_START);
    coveoua('send', 'event', 'svc', 'flowStart');
  }

  sendTicketFieldUpdated(fieldName) {
    this.analyticsUpdateTicketData();
    coveoua('svc:setAction', analyticsActionNames.TICKET_FIELD_UPDATE, {
      fieldName
    });
    coveoua('send', 'event', 'svc', 'click');
  }

  sendTicketClassificationClick(data) {
    this.analyticsUpdateTicketData();
    coveoua('svc:setAction', analyticsActionNames.TICKET_CLASSIFICATION_CLICK, {
      classificationId: data.classificationId,
      responseId: this.lastResponseId,
      classification: {
        value: data.value,
        confidence: data.confidence
      }
    });
    coveoua('send', 'event', 'svc', 'click');
  }

  sendTicketNextStage() {
    this.analyticsUpdateTicketData();
    coveoua('svc:setAction', analyticsActionNames.TICKET_NEXT_STAGE);
    coveoua('send', 'event', 'svc', 'click');
  }

  analyticsUpdateTicketData() {
    coveoua('svc:setTicket', {
      subject: this.theCase.Subject,
      description: this.theCase.Description,
      custom: {
        reason: this.theCase.Reason
      }
    });
  }
}
