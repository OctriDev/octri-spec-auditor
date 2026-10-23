package main

import (
	"encoding/json"
	"fmt"
	auditor "github.com/octridev/octri-spec-auditor-go"
	"io"
	"os"
)

func main() {
	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}
	var envelope struct {
		ABI     int             `json:"abiVersion"`
		Action  string          `json:"action"`
		Request json.RawMessage `json:"request"`
		Before  auditor.Report  `json:"before"`
		After   auditor.Report  `json:"after"`
		Report  auditor.Report  `json:"report"`
		Format  string          `json:"format"`
	}
	if err = json.Unmarshal(input, &envelope); err != nil {
		panic(err)
	}
	a := auditor.Auditor{}
	var output json.RawMessage
	wrapped := true
	var request auditor.Request
	if envelope.ABI == 1 {
		switch envelope.Action {
		case "audit", "bundle":
			if err = json.Unmarshal(envelope.Request, &request); err != nil {
				panic(err)
			}
			if envelope.Action == "audit" {
				output, err = a.Audit(request)
			} else {
				output, err = a.Bundle(request)
			}
		case "fix":
			output, err = a.Fix(envelope.Request)
		case "compare":
			output, err = a.Compare(envelope.Before, envelope.After)
		case "export":
			output, err = a.Export(envelope.Report, envelope.Format)
		case "rules":
			output, err = a.Rules()
		default:
			wrapped = false
			output, err = a.Call(input)
		}
	} else {
		wrapped = false
		output, err = a.Call(input)
	}
	if err != nil {
		panic(err)
	}
	if wrapped {
		fmt.Printf("{\"Ok\":%s}\n", output)
	} else {
		fmt.Println(string(output))
	}
}
