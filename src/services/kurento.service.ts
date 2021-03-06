import { ElementRef, Injectable, OnDestroy, Output } from '@angular/core';
import * as kurentoUtils from 'kurento-utils';
import { BehaviorSubject, Subscription } from 'rxjs';

export interface KurentoServiceConfig {
  cameraURL: string;
  webSocketUrl: string;
  videoComponent: ElementRef;
}

export enum VideoStatus {
  Loading,
  Play,
  Stop
}

declare var kurentoClient: any;

@Injectable()
export class KurentoService implements OnDestroy {

  @Output()
  public status: BehaviorSubject<VideoStatus> = new BehaviorSubject(VideoStatus.Stop);

  protected cameraURL: string;
  protected webSocketUrl: string;
  protected video: any;
  protected pipeline: any;  
  protected webRtcPeer: any;
  protected wsSubscription: Subscription;

  constructor() { }

  public ngOnDestroy(): void {
    this.wsSubscription.unsubscribe();
  }

  public configure(config: KurentoServiceConfig): void {
    this.cameraURL = config.cameraURL;
    this.webSocketUrl = config.webSocketUrl;
    this.video = config.videoComponent.nativeElement;
  }

  public start(): void {
    this.status.next(VideoStatus.Loading);

    const options = {
      remoteVideo: this.video
    };

    this.webRtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
      error => {
        if (error) {
          return this.onError(error);
        }
        this.webRtcPeer.generateOffer((a, b) => this.onOffer(a, b));

        this.webRtcPeer.peerConnection.addEventListener('iceconnectionstatechange', function(event){
          if(this.webRtcPeer && this.webRtcPeer.peerConnection){
            console.log("oniceconnectionstatechange -> " + this.webRtcPeer.peerConnection.iceConnectionState);
            console.log('icegatheringstate -> ' + this.webRtcPeer.peerConnection.iceGatheringState);
          }
        });
      });
  }

  public onOffer(error, sdpOffer): void {
    if (error) {
      return console.error('Error generating the offer');
    }

    new kurentoClient(this.webSocketUrl)
      .then((client) => {
        client.create("MediaPipeline")
          .then((p) => {
            this.pipeline = p;
            this.pipeline.create("PlayerEndpoint", {uri: this.cameraURL})
              .then((player) => {
                this.pipeline.create("WebRtcEndpoint")
                  .then((webRtcEndpoint) => {
                    this.setIceCandidateCallbacks(webRtcEndpoint, this.webRtcPeer, this.onError);
                    webRtcEndpoint.processOffer(sdpOffer)
                      .then((sdpAnswer) => {
                        webRtcEndpoint.gatherCandidates(this.onError);
                        this.webRtcPeer.processAnswer(sdpAnswer);
                      })
                      .catch((error) => {
                        this.onError(error);
                      })
                    player.connect(webRtcEndpoint)
                      .then(() => {
                        console.log("PlayerEndpoint-->WebRtcEndpoint connection established");
                        player.play()
                          .then(() => {
                            console.log("Player playing ...");
                          })
                          .catch((error) => {
                            this.onError(error);
                          })
                      })
                      .catch((error) => {
                        this.onError(error);
                      })
                  })
                  .catch((error) => {
                    this.onError(error);
                  })
              })
              .catch((error) => {
                this.onError(error);
              })
          })
          .catch((error) => {
            this.onError(error);
          })
      })
      .catch((error) => {
        this.onError(error);
      })
  }

  public stop(): void {
    if (this.webRtcPeer) {
      this.webRtcPeer.dispose();
      this.webRtcPeer = null;
    }
    if(this.pipeline){
      this.pipeline.release();
      this.pipeline = null;
    }
    this.playEnd();
  }

  public playEnd(): void {
    this.status.next(VideoStatus.Stop);
  }

  public onError(error): void {
    if(error) {
      console.error(error);
      this.playEnd();
    }
  }

  public setIceCandidateCallbacks(webRtcEndpoint, webRtcPeer, onError): void {
    webRtcPeer.on('icecandidate', function(candidate){
      console.log("Local icecandidate " + JSON.stringify(candidate));
  
      candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);
  
      webRtcEndpoint.addIceCandidate(candidate, onError);
  
    });
    webRtcEndpoint.on('OnIceCandidate', function(event){
      var candidate = event.candidate;
  
      console.log("Remote icecandidate " + JSON.stringify(candidate));
  
      webRtcPeer.addIceCandidate(candidate, onError);
    });
  }
}
